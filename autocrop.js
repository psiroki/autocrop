var DOMURL = window.URL || window.webkitURL || window;
var exif = null;
try {
	exif = new Worker("exifWorker.js");
} catch(e) {
}
var viewTemplate = null;
var jobs = [];

var calls = { };
var callCounter = 0;

if(exif) {
	exif.onmessage = function(e) {
		var id = e.data.id;
		var cb = calls[e.data.id];
		delete calls[e.data.id];
		if(cb)
			cb(e.data.exif);
	}
}

function getExif(blob, cb) {
	if (!exif) {
		cb(null);
		return;
	}
	var id = (++callCounter).toString();
	calls[id] = cb;
	exif.postMessage({ id: id, blob: blob });
}

function bindValues(input, output, formatter) {
	var prefix = output.getAttribute("data-prefix") || "";
	if(!formatter)
		formatter = value => value;
	var sync = () => {
		output.value = prefix+formatter(input.value);
	};
	input.addEventListener("input", sync);
	sync();
}

function enclose(img, size) {
	var iw = img.naturalWidth || img.width;
	var ih = img.naturalHeight || img.height;
	var w = iw;
	var h = ih;
	if(typeof size === "number") {
		if(w > size) {
			w = size;
			h = ih/iw*w;
		}
		if(h > size) {
			h = size;
			w = iw/ih*h;
		}
	}

	return { w: w, h: h };
}

function dataURLToBlob(dataURL) {
	var BASE64_MARKER = ';base64,';
	if (dataURL.indexOf(BASE64_MARKER) == -1) {
		var parts = dataURL.split(',');
		var contentType = parts[0].split(':')[1];
		var raw = decodeURIComponent(parts[1]);

		return new Blob([raw], {type: contentType});
	}

	var parts = dataURL.split(BASE64_MARKER);
	var contentType = parts[0].split(':')[1];
	var raw = window.atob(parts[1]);
	var rawLength = raw.length;

	var uInt8Array = new Uint8Array(rawLength);

	for (var i = 0; i < rawLength; ++i) {
		uInt8Array[i] = raw.charCodeAt(i);
	}

	return new Blob([uInt8Array], {type: contentType});
}

function scaleImage(img, tw, th) {
	tw |= 0;
	th |= 0;
	var sw = img.naturalWidth || img.width;
	var sh = img.naturalHeight || img.height;
	var canvas = document.createElement("canvas");
	canvas.width = sw;
	canvas.height = sh;
	var ctx = canvas.getContext("2d");
	ctx.drawImage(img, 0, 0);
	var sourceImageData = ctx.getImageData(0, 0, sw, sh);
	if(sw == tw && sh == th)
		return canvas;
	var source = sourceImageData.data;
	var targetImageData = ctx.createImageData(tw, th);
	var target = targetImageData.data;
	var targetLine = new Uint32Array(4*tw);
	var sampleCount = new Uint32Array(tw);
	var ty = 0;
	var tyc = 0;
	var srcLine = 0;
	var trgLine = 0;
	for(var sy=0; sy<sh; ++sy) {
		var tx = 0;
		var txc = 0;
		for(var sx=0; sx<sw; ++sx) {
			++sampleCount[tx];
			for(var c=0; c<4; ++c)
				targetLine[4*tx+c] += source[srcLine+sx*4+c];
			txc += tw;
			if(txc >= sw) {
				txc -= sw;
				++tx;
			}
		}
		srcLine += sw*4;
		tyc += th;
		if(tyc >= sh) {
			for(var tx=0; tx<tw; ++tx) {
				for(var c=0; c<4; ++c) {
					target[trgLine+tx*4+c] = targetLine[tx*4+c]/sampleCount[tx];
				}
			}

			for(var tx=0; tx<tw; ++tx) {
				for(var c=0; c<4; ++c) {
					targetLine[tx*4+c] = 0;
				}
				sampleCount[tx] = 0;
			}

			tyc -= sh;
			trgLine += tw*4;
			++ty;
		}
	}

	canvas.width = tw;
	canvas.height = th;
	ctx.clearRect(0, 0, tw, th);
	ctx.putImageData(targetImageData, 0, 0);

	return canvas;
}

function isFilled(arr, ref, pitch, refWidth, refPitch) {
	if(typeof pitch !== "number")
		pitch = ref.length;
	if(typeof refPitch !== "number")
		refPitch = 0;
	if(typeof refWidth !== "number")
		refWidth = ref.length;
	var l = arr.length;
	var refOffset = 0;
	for(var c=0; c<l; c += pitch) {
		for(var i=0; i<refWidth; ++i) {
			if(arr[c+i] != ref[refOffset+i])
				return false;
		}
		refOffset += refPitch;
	}
	return true;
}

var borderWidth = document.getElementById("borderWidth");

function generate(f, exif) {
	if(this === background && background.files.length > 0) {
		var bgf = background.files[0];
		return generate(bgf);
	}

	if(f instanceof Blob) {
		if(arguments.length <= 1) {
			getExif(f, function(exif) {
				console.log("exif", f.name, exif);
				generate(f, exif);
			});
			return;
		}
		document.body.classList.add("busy");
		var fn = f.name.replace(/^(?:.*[\\\/])?([^\\\/]+)\.[^.]+$/, "$1");
		var img = new Image();
		var cropImage = function(img) {
			var o = exif && typeof exif.Orientation === "number" ? exif.Orientation : 0;
			var s = enclose(img);
			var w = s.w;
			var h = s.h;
			if(o > 4) {
				w = s.h;
				h = s.w;
			}
			var canvas = document.createElement("canvas");
			var maxDim = Math.max(w, h);
			canvas.width = w;
			canvas.height = h;
			var panel = viewTemplate.cloneNode(true);
			var ownBar = panel.querySelector(".snackBar");
			panel.querySelector(".canvasHolder").appendChild(canvas);
			document.body.appendChild(panel);
			var ctx = canvas.getContext("2d");
			ctx.save();
			if(o >= 1) {
				var mat = new Float32Array(6);
				var x = o <= 4 ? 0 : 1;
				var y = o <= 4 ? 1 : 0;
				var xs = (o&3)>>1 ? -1 : 1;
				var ys = ((o-1)&3)>>1 ? -1 : 1;
				mat[2*x] = xs;
				mat[2*y] = 0;
				mat[2*x+1] = 0;
				mat[2*y+1] = ys;
				mat[4] = -w*Math.min(0, xs);
				mat[5] = -h*Math.min(0, ys);
//				console.log("matrix:", mat);
				ctx.transform(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]);
			}
			ctx.drawImage(scaleImage(img, s.w, s.h), 0, 0);
			ctx.restore();
			var imgData = ctx.getImageData(0, 0, s.w, s.h);
			var pixels = imgData.data;
			var ref = pixels.subarray(0, 4);
			var maxX = -1;
			var maxY = -1;
			var minX = imgData.width;
			var minY = imgData.height;
			var offset = 0;
			for(var y=0; y<imgData.height; ++y) {
				if(isFilled(pixels.subarray(offset, offset+imgData.width*4), ref, 4))
					maxY = y;
				else
					break;
				offset += imgData.width*4;
			}

			for(var x=0; x<imgData.width; ++x) {
				if(isFilled(pixels.subarray(x*4, pixels.length), ref, imgData.width*4))
					maxX = x;
				else
					break;
			}

			offset = imgData.width*imgData.height*4;
			for(var y=imgData.height-1; y>=0; --y) {
				offset -= imgData.width*4;
				if(isFilled(pixels.subarray(offset, offset+imgData.width*4), ref, 4))
					minY = y;
				else
					break;
			}

			for(var x=imgData.width-1; x>=0; --x) {
				if(isFilled(pixels.subarray(x*4, pixels.length), ref, imgData.width*4))
					minX = x;
				else
					break;
			}

			++maxX;
			++maxY;
			var bw = +borderWidth.value;
			var lumWeights = [ 0.299, 0.587, 0.114 ].map(e => e/(255*255));
			var brightAtBorder = Math.sqrt(lumWeights.reduce((sum, weight, index) => sum + weight*ref[index]*ref[index], 0)) > 0.5;
			if(brightAtBorder)
				canvas.parentNode.classList.toggle("brightAtBorder", brightAtBorder);
			if(maxX < minX && maxY < minY) {
				canvas.width = minX-maxX+bw*2;
				canvas.height = minY-maxY+bw*2;

				ctx.clearRect(0, 0, canvas.width, canvas.height);
				if(bw > 0 && ref[3] > 0) {
					var fill = Array.from(ref);
					fill[3] *= 1.0/255.0;
					ctx.fillStyle = "rgba("+fill.join(", ")+")";
					ctx.fillRect(0, 0, canvas.width, canvas.height);
				}
				ctx.putImageData(imgData, -maxX+bw, -maxY+bw);
			}
			var saveJpgButton = ownBar.querySelector(".saveJpgButton");
			var qualityOutput = ownBar.querySelector(".jpgQualityNum");
			var qualityInput = ownBar.querySelector(".jpgQuality");
			if(saveJpgButton) {
				qualityOutput.style.lineHeight = saveJpgButton.offsetHeight+"px";
			}
			bindValues(qualityInput, qualityOutput,
				e => { var s = String(e); return "\u2007".repeat(3).substring(s.length)+s; })
			Array.from(ownBar.querySelectorAll(".saveJpgButton"))
				.forEach(function(e) {
					e.addEventListener("click", function() {
						saveAsJPG(canvas, fn, parseFloat(qualityInput.value)/100);
					});
				});
			Array.from(ownBar.querySelectorAll(".savePngButton"))
				.forEach(function(e) {
					e.addEventListener("click", function() {
						saveAsPNG(canvas, fn);
					});
				});
			Array.from(ownBar.querySelectorAll(".closeButton"))
				.forEach(function(e) {
					e.addEventListener("click", function() {
						if(panel.parentNode) {
							panel.parentNode.removeChild(panel);
						}
					});
				});
			Array.from(ownBar.querySelectorAll(".recropButton"))
				.forEach(function(e) {
					e.addEventListener("click", function() {
						cropImage(canvas);
					});
				});
			document.body.classList.remove("busy");
		};
		img.onload = cropImage.bind(this, img);
		var reader = new FileReader();
		reader.onload = function() {
			img.src = this.result;
		};
		reader.readAsDataURL(f);
	}
}

function saveAsJPG(canvas, filename, quality) {
	return save(canvas, filename+".jpg", "image/jpeg", quality || 0.75);
}

function saveAsPNG(canvas, filename) {
	return save(canvas, filename+".png", "image/png", 1);
}

function save(canvas, filename, format, quality) {
	function handleBlob(blob) {
		var blobUrl = DOMURL.createObjectURL(blob);
		var a = document.createElement("a");
		a.href = blobUrl;
		a.download = filename;
		a.click();
		DOMURL.revokeObjectURL(blobUrl);
	}

	if(typeof canvas.toBlob === "function") {
		try {
			canvas.toBlob(handleBlob, format, quality);
			return;
		} catch(e) {
			// don't worry, we'll do it old school
		}
	}
	var canvasDataUrl = canvas.toDataURL(format, quality);
	var blob = dataURLToBlob(canvasDataUrl);
	handleBlob(blob);
}

function isImageMime(s) {
	var prefix = "image/";
	return s.substring(0, prefix.length) === prefix;
}

function isDraggingImage(e) {
	var hasImage = false;
	var files = Array.prototype.slice.call(e.dataTransfer.files);
	if(files.length === 0)
		files = Array.prototype.slice.call(e.dataTransfer.items);
	files.forEach(function(f) {
		if(isImageMime(f.type)) {
			hasImage = true;
			return false;
		}
	});
	return hasImage;
}

window.addEventListener("DOMContentLoaded", function() {
	background.addEventListener("change", generate);
	viewTemplate = document.querySelector(".view");
	viewTemplate.parentNode.removeChild(viewTemplate);
	document.body.addEventListener("dragover", function(e) {
		e.stopPropagation();
		e.preventDefault();
		var hasImage = isDraggingImage(e);
		e.dataTransfer.dropEffect = hasImage ? "copy" : "none";
		if(hasImage)
			this.classList.add("dragOver");
		else
			this.classList.remove("dragOver");
	}, false);
	document.body.addEventListener("drop", function(e) {
		e.stopPropagation();
		e.preventDefault();
		var files = Array.prototype.slice.call(e.dataTransfer.files);
		files.forEach(function(f) {
			if(isImageMime(f.type)) {
				generate(f);
			}
		});
		this.classList.remove("dragOver");
	}, false);
	document.body.addEventListener("dragenter", function(e) {
		if(isDraggingImage(e))
			this.classList.add("dragOver");
	}, false);
	document.body.addEventListener("dragleave", function(e) {
		this.classList.remove("dragOver");
	}, false);
});
var offset = 1;
var offsetExp = Math.exp(offset);
var scale = (Math.log(64+offsetExp)-offset)/512;
bindValues(document.querySelector("#borderWidth"), document.querySelector("#borderWidthRange"),
	e => Math.round((Math.log(+e+offsetExp)-offset)/scale));
bindValues(document.querySelector("#borderWidthRange"), document.querySelector("#borderWidth"),
	e => Math.round(Math.exp(+e*scale+offset)-offsetExp));
