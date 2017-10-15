var DOMURL = window.URL || window.webkitURL || window;
var exif = null;
try {
	exif = new Worker("exifWorker.js");
} catch(e) {
	console.warn("The exifWorker could not be loaded, JPEG files might appear in a funny orientation", e);
}
var viewTemplate = null;

var calls = { };
var callCounter = 0;

var c = { };

var gpu = (function() {
	var testCanvas = document.createElement("canvas");
	testCanvas.width = 1;
	testCanvas.height = 1;
	var ctx = testCanvas.getContext("2d");
	ctx.fillStyle = "rgba(10, 20, 30, 1)";
	ctx.fillRect(0, 0, 1, 1);
	var arr = ctx.getImageData(0, 0, 1, 1).data;
	var values = [10, 20, 30, 255];
	var channels = [];
	var bitOffsets = [];
	var uint32Buffer = new Uint32Array(arr.buffer);
	var uint32Value = uint32Buffer[0];
	for(var val of values) {
		var channel = -1;
		var minDiff = 256;
		var minBitOffsetDiff = 256;
		var bitOffset = -1;
		for(var i=0; i<arr.length; ++i) {
			var diff = Math.abs(arr[i]-val);
			if(diff < minDiff) {
				minDiff = diff;
				channel = i;
			}
			diff = Math.abs(((uint32Value >>> (i*8))&0xff)-val);
			if(diff < minBitOffsetDiff) {
				minBitOffsetDiff = diff;
				bitOffset = i*8;
			}
		}
		channels.push(channel);
		bitOffsets.push(bitOffset);
	}
	return {
		channels: channels,
		bitOffsets: bitOffsets
	};
})();

function collect(ids) {
	if (!(ids instanceof Array))
		ids = Array.from(arguments);
	ids.forEach(function(e) {
		c[e] = document.getElementById(e);
	});
}

collect("background", "disableCrop",
	"gradientCrop", "allowDeviation",
	"borderWidth", "borderWidthRange",
	"differenceDelta", "differenceDeltaRange",
	"insertionPoint", "transparentCartoon");

if(exif) {
	exif.onmessage = function(e) {
		var id = e.data.id;
		var cb = calls[id];
		delete calls[id];
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

const CRC32_TABLE = (
  "00000000,77073096,ee0e612c,990951ba,076dc419,706af48f,e963a535,9e6495a3," +
	"0edb8832,79dcb8a4,e0d5e91e,97d2d988,09b64c2b,7eb17cbd,e7b82d07,90bf1d91," +
	"1db71064,6ab020f2,f3b97148,84be41de,1adad47d,6ddde4eb,f4d4b551,83d385c7," +
	"136c9856,646ba8c0,fd62f97a,8a65c9ec,14015c4f,63066cd9,fa0f3d63,8d080df5," +
	"3b6e20c8,4c69105e,d56041e4,a2677172,3c03e4d1,4b04d447,d20d85fd,a50ab56b," +
	"35b5a8fa,42b2986c,dbbbc9d6,acbcf940,32d86ce3,45df5c75,dcd60dcf,abd13d59," +
	"26d930ac,51de003a,c8d75180,bfd06116,21b4f4b5,56b3c423,cfba9599,b8bda50f," +
	"2802b89e,5f058808,c60cd9b2,b10be924,2f6f7c87,58684c11,c1611dab,b6662d3d," +
	"76dc4190,01db7106,98d220bc,efd5102a,71b18589,06b6b51f,9fbfe4a5,e8b8d433," +
	"7807c9a2,0f00f934,9609a88e,e10e9818,7f6a0dbb,086d3d2d,91646c97,e6635c01," +
	"6b6b51f4,1c6c6162,856530d8,f262004e,6c0695ed,1b01a57b,8208f4c1,f50fc457," +
	"65b0d9c6,12b7e950,8bbeb8ea,fcb9887c,62dd1ddf,15da2d49,8cd37cf3,fbd44c65," +
	"4db26158,3ab551ce,a3bc0074,d4bb30e2,4adfa541,3dd895d7,a4d1c46d,d3d6f4fb," +
	"4369e96a,346ed9fc,ad678846,da60b8d0,44042d73,33031de5,aa0a4c5f,dd0d7cc9," +
	"5005713c,270241aa,be0b1010,c90c2086,5768b525,206f85b3,b966d409,ce61e49f," +
	"5edef90e,29d9c998,b0d09822,c7d7a8b4,59b33d17,2eb40d81,b7bd5c3b,c0ba6cad," +
	"edb88320,9abfb3b6,03b6e20c,74b1d29a,ead54739,9dd277af,04db2615,73dc1683," +
	"e3630b12,94643b84,0d6d6a3e,7a6a5aa8,e40ecf0b,9309ff9d,0a00ae27,7d079eb1," +
	"f00f9344,8708a3d2,1e01f268,6906c2fe,f762575d,806567cb,196c3671,6e6b06e7," +
	"fed41b76,89d32be0,10da7a5a,67dd4acc,f9b9df6f,8ebeeff9,17b7be43,60b08ed5," +
	"d6d6a3e8,a1d1937e,38d8c2c4,4fdff252,d1bb67f1,a6bc5767,3fb506dd,48b2364b," +
	"d80d2bda,af0a1b4c,36034af6,41047a60,df60efc3,a867df55,316e8eef,4669be79," +
	"cb61b38c,bc66831a,256fd2a0,5268e236,cc0c7795,bb0b4703,220216b9,5505262f," +
	"c5ba3bbe,b2bd0b28,2bb45a92,5cb36a04,c2d7ffa7,b5d0cf31,2cd99e8b,5bdeae1d," +
	"9b64c2b0,ec63f226,756aa39c,026d930a,9c0906a9,eb0e363f,72076785,05005713," +
	"95bf4a82,e2b87a14,7bb12bae,0cb61b38,92d28e9b,e5d5be0d,7cdcefb7,0bdbdf21," +
	"86d3d2d4,f1d4e242,68ddb3f8,1fda836e,81be16cd,f6b9265b,6fb077e1,18b74777," +
	"88085ae6,ff0f6a70,66063bca,11010b5c,8f659eff,f862ae69,616bffd3,166ccf45," +
	"a00ae278,d70dd2ee,4e048354,3903b3c2,a7672661,d06016f7,4969474d,3e6e77db," +
	"aed16a4a,d9d65adc,40df0b66,37d83bf0,a9bcae53,debb9ec5,47b2cf7f,30b5ffe9," +
	"bdbdf21c,cabac28a,53b39330,24b4a3a6,bad03605,cdd70693,54de5729,23d967bf," +
	"b3667a2e,c4614ab8,5d681b02,2a6f2b94,b40bbe37,c30c8ea1,5a05df1b,2d02ef8d"
).split(",").map(e => parseInt(e, 16));

function crc32hex(byteArray) {
	var len = byteArray.length;
	var r = 0xffffffff;
	for (var i = 0; i < len; i++) {
			r = (r >> 8) ^ CRC32_TABLE[byteArray[i] ^ (r & 0x000000FF)];
			r &= 0xffffffff;
	}
	console.log("CRC: ", r.toString(16));
	var result = [];
	for (var i=0; i<8; ++i) {
		result.push(((r>>(28-i*4))&0xf).toString(16));
	}
	return result.join("");
}

const BASE64_MARKER = ";base64,";

function uriEncodedDataURLToBlob(dataURL) {
	var parts = dataURL.split(',');
	var colon = parts[0].indexOf(':');
	var contentType = parts[0].substring(colon+1);
	var raw = decodeURIComponent(parts[1]);

	return new Blob([raw], {type: contentType});
}

function base64EncodedDataURLToBlob(dataURL) {
	var parts = dataURL.split(BASE64_MARKER);
	var colon = parts[0].indexOf(':');
	var contentType = parts[0].substring(colon+1);
	var raw = window.atob(parts[1]);
	var rawLength = raw.length;

	var uInt8Array = new Uint8Array(rawLength);

	for (var i = 0; i < rawLength; ++i) {
		uInt8Array[i] = raw.charCodeAt(i);
	}

	return new Blob([uInt8Array], {type: contentType});
}

function dataURLToBlob(dataURL) {
	if (dataURL.indexOf(BASE64_MARKER) == -1)
		return uriEncodedDataURLToBlob(dataURL);
	else
		return base64EncodedDataURLToBlob(dataURL);
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
			for(var ch=0; ch<4; ++ch)
				targetLine[4*tx+ch] += source[srcLine+sx*4+ch];
			txc += tw;
			if(txc >= sw) {
				txc -= sw;
				++tx;
			}
		}
		srcLine += sw*4;
		tyc += th;
		if(tyc >= sh) {
			for(let tx=0; tx<tw; ++tx) {
				for(var ch=0; c<4; ++ch) {
					target[trgLine+tx*4+ch] = targetLine[tx*4+ch]/sampleCount[tx];
				}
			}

			for(let tx=0; tx<tw; ++tx) {
				for(var ch=0; ch<4; ++ch) {
					targetLine[tx*4+ch] = 0;
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

function strictlyEquals(a, b) {
	return a == b;
}

function allowDelta(delta) {
	return function (a, b) {
		return Math.abs(a-b) <= delta;
	};
}

function createFillTest(eqPred) {
	if(typeof eqPred !== "function")
		eqPred = strictlyEquals;
  return function (arr, ref, pitch, refWidth, refPitch) {
		if(typeof eqPred !== "function")
			eqPred = strictlyEquals;
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
				if(!eqPred(arr[c+i], ref[refOffset+i]))
					return false;
			}
			refOffset += refPitch;
		}
		return true;
	};
}

function bindClickForAll(parent, selector, handler) {
	Array.from(parent.querySelectorAll(selector)).forEach(e => {
		e.addEventListener("click", handler);
	});
}

function Tool(name, selectCallback) {
	this.name = name;
	this.selectCallback = selectCallback;
	this.listeners = [];
	this.classChanges = [];
	this.addedElements = [];
}

Tool.prototype = {
	getName() { return this.name; },
	select(selecting) {
		if(selecting)
			return this.selectCallback(selecting);

		try {
			return this.selectCallback(selecting);
		} finally {
			this.removeListeners();
			this.restoreClasses();
			this.removeAddedElements();
		}
	},
	toggle(target, className, value) {
		this.classChanges.push({
			target: target,
			className: className,
			value: target.classList.contains(className)
		});
		target.classList.toggle(className, value);
	},
	addListener(target, eventName, callback) {
		this.listeners.push({
			target: target,
			eventName: eventName,
			callback: callback
		});
		target.addEventListener(eventName, callback);
	},
	addElement(e) {
		this.addedElements.push(e);
	},
	elementRemoved(e) {
		var l = this.addedElements.length;
		for(var i=0; i<l; ++i) {
			if(this.addedElements[i] === e) {
				this.addedElements.splice(i, 1);
				break;
			}
		}
	},
	removeListeners() {
		this.listeners.forEach(l => {
			l.target.removeEventListener(l.eventName, l.callback);
		});
		this.listeners = [];
	},
	restoreClasses() {
		this.classChanges.forEach(l => {
			l.target.classList.toggle(l.className, l.value);
		});
		this.classChanges = [];
	},
	removeAddedElements() {
		this.addedElements.forEach((e) => {
			var p = e.parentNode;
			if(p)
				p.removeChild(e);
		});
		this.addedElements = [];
	},
	getButtonSelector() { return "."+this.name+"Button"; }
};

/// A MaskBuffer is an 8 bit alpha bitmap with two 12 bit annotation channels
function MaskBuffer(width, height) {
	this.backing = new Uint32Array(width*height);
	this.pitch = width;
	this.width = width;
	this.height = height;
}

MaskBuffer.prototype = {
	_checkSize(otherMaskBuffer) {
		if(this.width !== otherMaskBuffer.width || this.height !== otherMaskBuffer.height || this.pitch !== otherMaskBuffer.pitch)
			throw "You can only combine masks of the same size"
	},
	set(x, y, alpha, anX, anY) {
		if (x >= 0 && x < this.width && y >= 0 && y < this.height)
			this.setAtOffset(y*this.pitch+x, alpha, anX, anY);
	},
	add(otherMaskBuffer) {
		this._checkSize(otherMaskBuffer);
		var w = this.width, h = this.height;
		var base = 0;
		var target = this.backing;
		var source = otherMaskBuffer.backing;
		for(var y=0; y<h; ++y) {
			for(var x=0; x<w; ++x) {
				var targetAlpha = target[base+x]&0xff;
				if(targetAlpha >= 0xff)
					continue;
				var newAlpha = Math.max(targetAlpha, source[base+x]&0xff);
				target[base+x] = (target[base+x]&(~0xff))|newAlpha;
			}
			base += this.pitch;
		}
	},
	subtract(otherMaskBuffer) {
		this._checkSize(otherMaskBuffer);
		var w = this.width, h = this.height;
		var base = 0;
		var target = this.backing;
		var source = otherMaskBuffer.backing;
		for(var y=0; y<h; ++y) {
			for(var x=0; x<w; ++x) {
				var targetAlpha = target[base+x]&0xff;
				if(targetAlpha <= 0)
					continue;
				var sourceAlpha = source[base+x]&0xff;
				if(sourceAlpha <= 0)
					continue;
				var newAlpha = Math.min(targetAlpha, 0xff-sourceAlpha);
				target[base+x] = (target[base+x]&~0xff)|newAlpha;
			}
			base += this.pitch;
		}
	},
	invert() {
		var w = this.width, h = this.height;
		var base = 0;
		var target = this.backing;
		for(var y=0; y<h; ++y) {
			for(var x=0; x<w; ++x) {
				var targetAlpha = target[base+x]&0xff;
				target[base+x] = (target[base+x]&~0xff)|(0xff-targetAlpha);
			}
			base += this.pitch;
		}
	},
	offset(x, y) {
		return y*this.pitch+x;
	},
	setAtOffset(offset, alpha, anX, anY) {
		this.backing[offset] = (alpha&0xff) | ((anX&4095) << 8) | ((anY&4095) << 20);
	},
	getAlphaAtOffset(offset) {
		return this.backing[offset] & 0xff;
	},
	getAnnotationXAtOffset(offset) {
		return (this.backing[offset] >> 8) & 4095;
	},
	getAnnotationYAtOffset(offset) {
		return (this.backing[offset] >> 20) & 4095;
	},
	signAnnotation(value) {
		return MaskBuffer.signAnnotation(value);
	}
};

MaskBuffer.signAnnotation = (value) => value & 2048 ? value | (~4095) : value;

function Mask(sourceCanvas) {
	this.sourceCanvas = sourceCanvas;
	this.width = sourceCanvas.width;
	this.pitch = this.width;
	this.height = sourceCanvas.height;
	this._reinitializeSource();
	this.maskBuffer = new MaskBuffer(this.width, this.height);
	this.rectangle = [-1, -1, -1, -1];
}

Mask.prototype = {
	_reinitializeSource() {
		this.sourceContext = this.sourceCanvas.getContext("2d");
		this.imageData = this.sourceContext.getImageData(0, 0, this.width, this.height);
		this.imageDataView = new Uint32Array(this.imageData.data.buffer);
	},
	_handlePixelTest(pixelTest, offsetOpt) {
		var sourcePixel = pixelTest === null ? this.imageDataView[offsetOpt] : pixelTest;
		return (pixel) => pixel === sourcePixel;
	},
	_addPixelSpan(startX, endX, y) {
		// make the rectangle contain this span of pixels
		if(startX < this.rectangle[0] || this.rectangle[0] === -1)
			this.rectangle[0] = startX;
		if(endX > this.rectangle[2] || this.rectangle[2] === -1)
			this.rectangle[2] = endX;
		if(y < this.rectangle[1] || this.rectangle[1] === -1)
			this.rectangle[1] = y;
		if(y >= this.rectangle[3] || this.rectangle[3] === -1)
			this.rectangle[3] = y+1;
	},
	isSelected(x, y) {
		if(x < 0 || x >= this.width || y < 0 || y >= this.height)
			return false;
		var offset = this.maskBuffer.offset(x, y);
		return this.maskBuffer.getAlphaAtOffset(offset) > 0;
	},
	selectedPixels: function*() {
		var left = this.rectangle[0];
		var top = this.rectangle[1];
		var right = this.rectangle[2];
		var bottom = this.rectangle[3];
		var base = top*this.pitch;
		for(var y=top; y<bottom; ++y, base += this.pitch) {
			for(var x=left; x<right; ++x) {
				var offset = base+x;
				if(this.maskBuffer.getAlphaAtOffset(offset) > 0)
					yield { x: x, y: y };
			}
		}
	},
	selectedPixelValues: function*() {
		var left = this.rectangle[0];
		var top = this.rectangle[1];
		var right = this.rectangle[2];
		var bottom = this.rectangle[3];
		var base = top*this.pitch;
		for(var y=top; y<bottom; ++y, base += this.pitch) {
			for(var x=left; x<right; ++x) {
				var offset = base+x;
				if(this.maskBuffer.getAlphaAtOffset(offset) > 0)
					yield this.imageDataView[offset];
			}
		}
	},
	selectAll(pixelTest) {
		if(typeof pixelTest !== "function")
			pixelTest = this._handlePixelTest(pixelTest);
		var left = 0;
		var top = 0;
		var right = this.width;
		var bottom = this.height;
		var base = top*this.pitch;
		for(var y=top; y<bottom; ++y, base += this.pitch) {
			var startX = 0;
			for(var x=left; x<right; ++x) {
				var offset = base+x;
				if(this.maskBuffer.getAlphaAtOffset(offset) > 0)
					continue;
				if(pixelTest(this.imageDataView[offset])) {
					if(startX === -1)
						startX = x;

					this.maskBuffer.setAtOffset(offset, 255, 0, 0);
				} else {
					if(startX >= 0)
						this._addPixelSpan(startX, x, y);
					startX = -1;
				}
			}
			if(startX >= 0)
				this._addPixelSpan(startX, right, y);
		}
	},
	addMask(otherMask) {
		this.maskBuffer.add(otherMask.maskBuffer);
		var source = otherMask.rectangle;
		var target = this.rectangle;
		for(var i=0; i<4; ++i) {
			if(target[i] === -1) {
				target[i] = source[i];
				continue;
			}
			var diff = source[i]-target[i];
			if(i < 2)
				diff = -diff;
			if(diff > 0)
				target[i] = source[i];
		}
	},
	subtractMask(otherMask) {
		this.maskBuffer.subtract(otherMask.maskBuffer);
	},
	invert() {
		this.maskBuffer.invert();
		this._addPixelSpan(0, this.width, 0);
		this._addPixelSpan(0, this.width, this.height-1);
	},
	fill(x, y, pixelTest) {
		var w = this.width;
		if(x < 0 || x >= w || y < 0 || y >= this.height)
			return;
		var offset = this.maskBuffer.offset(x, y);
		if(typeof pixelTest !== "function")
			pixelTest = this._handlePixelTest(pixelTest, offset);
		if(this.maskBuffer.getAlphaAtOffset(offset) > 0 || !pixelTest(this.imageDataView[offset]))
			return;
		var startOffset = offset;
		var startX = x;
		--startOffset;
		--startX;
		while(startX >= 0 && pixelTest(this.imageDataView[startOffset])) {
			--startOffset;
			--startX;
		}
		++startX;
		++startOffset;

		var endOffset = offset;
		var endX = x;
		++endOffset;
		++endX;
		while(endX < w && pixelTest(this.imageDataView[endOffset])) {
			++endOffset;
			++endX;
		}

		// make the rectangle contain this span of pixels
		this._addPixelSpan(startX, endX, y);

		for(var o=startOffset; o<endOffset; ++o)
			this.maskBuffer.setAtOffset(o, 255, 0, 0);
		var p = this.pitch;
		if(y > 0) {
			var currentX = startX;
			for(var o=startOffset; o<endOffset; ++o, ++currentX) {
				if(this.maskBuffer.getAlphaAtOffset(o-p) <= 0 && pixelTest(this.imageDataView[o-p]))
					this.fill(currentX, y-1, pixelTest);
			}
		}
		if(y < this.height-1) {
			var currentX = startX;
			for(var o=startOffset; o<endOffset; ++o, ++currentX) {
				if(this.maskBuffer.getAlphaAtOffset(o+p) <= 0 && pixelTest(this.imageDataView[o+p]))
					this.fill(currentX, y+1, pixelTest);
			}
		}
	},
	createHighlightElement(elementClassOpt) {
		var result = document.createElement("canvas");
		result.width = this.width;
		result.height = this.height;
		var ctx = result.getContext("2d");
		ctx.clearRect(0, 0, this.width, this.height);
		var imageData = ctx.getImageData(0, 0, this.width, this.height);
		var sourceData = this.imageData.data;
		var data = imageData.data;
		var r = gpu.channels[0];
		var g = gpu.channels[1];
		var b = gpu.channels[2];
		var a = gpu.channels[3];
		var left = this.rectangle[0];
		var top = this.rectangle[1];
		var right = this.rectangle[2];
		var bottom = this.rectangle[3];
		var base = top*this.pitch;
		for(var y=top; y<bottom; ++y, base += this.pitch) {
			for(var x=left; x<right; ++x) {
				var i = base+x;
				var alpha = this.maskBuffer.getAlphaAtOffset(i);
				if(alpha > 0) {
					var dataOffset = i*4;
					var lum = 76*sourceData[dataOffset+r]+149*sourceData[dataOffset+g]+29*sourceData[dataOffset+b];
					if(lum < 32768)
						lum = 255;
					else
						lum = 0;
					data[dataOffset+r] = lum;
					data[dataOffset+g] = lum;
					data[dataOffset+b] = lum;
					data[dataOffset+a] = alpha;
				}
			}
		}
		ctx.putImageData(imageData, 0, 0);
		if(elementClassOpt)
			result.className = elementClassOpt;
		return result;
	},
	paint(colorOrColorFunction) {
		this._reinitializeSource();
		var colorFun = colorOrColorFunction;
		if(typeof colorOrColorFunction !== "function") {
			colorFun = () => colorOrColorFunction;
		}
		var left = this.rectangle[0];
		var top = this.rectangle[1];
		var right = this.rectangle[2];
		var bottom = this.rectangle[3];
		var base = top*this.pitch;
		for(var y=top; y<bottom; ++y, base += this.pitch) {
			for(var x=left; x<right; ++x) {
				var i = base+x;
				var alpha = this.maskBuffer.getAlphaAtOffset(i);
				if(alpha > 0) {
					this.imageDataView[i] = colorFun(this.imageDataView[i]);
				}
			}
		}
		this.sourceContext.clearRect(0, 0, this.width, this.height);
		this.sourceContext.putImageData(this.imageData, 0, 0);
	}
};

function colorDistance(a, b) {
	return Math.abs((a&0xff)-(b&0xff))+
		Math.abs((a>>>8&0xff)-(b>>>8&0xff))+
		Math.abs((a>>>16&0xff)-(b>>>16&0xff))+
		Math.abs((a>>>24&0xff)-(b>>>24&0xff));
}

function mix(a, b, f) {
	var fi = 1-f;
	return Math.abs((a&0xff)*fi+f*(b&0xff))|
		((a>>>8&0xff)*fi+f*(b>>>8&0xff))<<8|
		((a>>>16&0xff)*fi+f*(b>>>16&0xff))<<16|
		((a>>>24&0xff)*fi+f*(b>>>24&0xff))<<24;
}

function generate(f, exif) {
	if(this === c.background && c.background.files.length > 0) {
		for(var bgf of Array.from(c.background.files))
			generate(bgf);
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
		var fn = (f.name || "pastedImage").replace(/^(?:.*[\\\/])?([^\\\/]+)\.[^.]+$/, "$1");
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
			canvas.width = w;
			canvas.height = h;
			var panel = viewTemplate.cloneNode(true);
			var canvasParent = panel.querySelector(".canvasParent");
			var ownBar = panel.querySelector(".snackBar");
			var refColor = -1;

			var tool = null;
			var tools = [new Tool("eraser", function(doSelect) {
				if(doSelect) {
					var createAxis = (orientation) => {
						var axis = document.createElement("span");
						axis.classList.add(orientation+"Ants");
						axis.classList.add(orientation+"Axis");
						axis.classList.add("hideCursor");
						return axis;
					}
					var axis = [
						createAxis("vertical"),
						createAxis("horizontal")
					];
					axis.forEach(a => {
						canvasParent.appendChild(a);
						this.addElement(a)
					});
					var canvasX = (event) => event.offsetX;
					var canvasY = (event) => event.offsetY;
					this.addListener(canvas, "mousemove", function(event) {
						var x = canvasX(event);
						var y = canvasY(event);
						axis[0].style.left = x+"px";
						axis[1].style.top = y+"px";
						if(x < 0 || x >= canvas.offsetWidth || y < 0 || y >= canvas.offsetHeight) {
							axis[0].style.display = "none";
							axis[1].style.display = "none";
						} else {
							axis[0].style.display = "";
							axis[1].style.display = "";
						}
					});
					canvas.tabIndex = 0;
					var selectionStack = [];

					var removeHighlight = (selection) => {
						if(!selection.highlight)
							return;
						var p = selection.highlight.parentNode;
						if(p)
							p.removeChild(selection.highlight);
						this.elementRemoved(selection.highlight);
					};

					var execute = (commit) => {
						if(selectionStack.length) {
							var selection = selectionStack.pop();
							if(commit)
								selection.mask.paint(selection.refColor);
							removeHighlight(selection);
						}
					};

					this.addListener(canvas, "keydown", (event) => {
						if(event.which === 13) {
							event.preventDefault();
							event.stopPropagation();
							execute(true);
						} else if(event.which === 8 || event.which === 46) {
							event.preventDefault();
							event.stopPropagation();
							execute(false);
						}
					});
					this.addListener(canvas, "click", (event) => {
						canvas.focus();
						var x = canvasX(event);
						var y = canvasY(event);
						var current;
						if(selectionStack.length > 0) {
							current = selectionStack[0];
						} else {
							current = {
								mask: new Mask(canvas),
								highlight: null,
								refColor: refColor
							};
							selectionStack.push(current);
						}
						console.log("Testing for color: ", refColor.toString(16));
						current.mask.fill(x, y, (pixel) => pixel !== refColor);
						removeHighlight(current);
						var fillHighlight = current.mask.createHighlightElement("highlightCanvas");
						canvasParent.appendChild(fillHighlight);
						this.addElement(fillHighlight);
						current.highlight = fillHighlight;
					});
					this.toggle(canvas, "hideCursor", true);
					this.toggle(canvasParent, "hideCursor", true);
				} else {
					// everything's removed automatically
					canvas.tabIndex = -1;
				}
			})];

			function syncTool() {
				ownBar.classList.toggle("toolSelected", !!tool);
				tools.forEach(function(t) {
					Array.from(ownBar.querySelectorAll(t.getButtonSelector())).forEach(e => {
						e.classList.toggle("checked", t === tool);
					});
				});
			}

			canvasParent.appendChild(canvas);
			if(!c.insertionPoint || !c.insertionPoint.parentNode)
				document.body.appendChild(panel);
			else
				c.insertionPoint.parentNode.insertBefore(panel, c.insertionPoint.nextSibling);
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
			var imgData;
			var pixels;
			var ref;
			var reinitializeCrop = () => {
				imgData = ctx.getImageData(0, 0, s.w, s.h);
				pixels = imgData.data;
				ref = pixels.subarray(0, 4);
				var refColorBuffer = new Uint32Array(ref.buffer, 0, 1);
				refColor = refColorBuffer[0];
			};
			reinitializeCrop();
			var maxX = -1;
			var maxY = -1;
			var minX = imgData.width;
			var minY = imgData.height;
			var offset = 0;
			var pitch = imgData.width*4;
			var doCrop = !c.disableCrop.checked;
			var transparentCartoon = c.transparentCartoon.checked;
			var gradientCrop = c.gradientCrop.checked;
			var allowDeviation = c.allowDeviation.checked;
			var isFilled;
			var differenceDelta = +c.differenceDelta.value;
			if(differenceDelta > 0)
				isFilled = createFillTest(allowDelta(differenceDelta));
			else
				isFilled = createFillTest();
			if(transparentCartoon) {
				var keepMask = new Mask(canvas);
				var tester = (color) => color !== refColor;
				keepMask.selectAll(tester);
				var savedMask = new Mask(canvas);
				savedMask.addMask(keepMask);
				for(var point of keepMask.selectedPixels()) {
					var blobMask = new Mask(canvas);
					blobMask.fill(point.x, point.y, tester);
					var palette = new Set();
					for(var color of blobMask.selectedPixelValues()) {
						if(!palette.has(color))
							palette.add(color);
					}
					var peakValue = 0;
					var peakColor = 0;
					for(var color of palette) {
						var value = colorDistance(color, refColor);
						if(value > peakValue) {
							peakValue = value;
							peakColor = color;
						}
					}
					var backgroundColor = peakColor & 0xffffff;
					blobMask.paint((source) => {
						if(source === peakColor)
							return source;
						var peakDistance = colorDistance(source, peakColor);
						var refDistance = colorDistance(source, refColor);
						return mix(backgroundColor, peakColor, refDistance/(peakDistance+refDistance));
					});
					keepMask.subtractMask(blobMask);
				}
				savedMask.invert();
				savedMask.paint(0);
				reinitializeCrop();
			}
			if(doCrop) {
				var cropRef = ref;
				var cropRefWidth = cropRef.length;
				var cropRefPitch = 0;

				if(gradientCrop) {
					cropRef = pixels;
					cropRefWidth = imgData.width*4;
					cropRefPitch = 0;
				}

				for(var y=0; y<imgData.height; ++y) {
					if(gradientCrop && allowDeviation && y > 0)
						cropRef = pixels.subarray((y-1)*pitch, pixels.length);
					if(isFilled(pixels.subarray(offset, offset+pitch), cropRef, Math.min(cropRefWidth, pitch), cropRefWidth, cropRefPitch))
						maxY = y;
					else
						break;
					offset += pitch;
				}

				if(gradientCrop) {
					cropRef = pixels;
					cropRefWidth = 4;
					cropRefPitch = pitch;
				}

				for(var x=0; x<imgData.width; ++x) {
					if(gradientCrop && allowDeviation && x > 0)
						cropRef = pixels.subarray((x-1)*4, pixels.length);
					if(isFilled(pixels.subarray(x*4, pixels.length), cropRef, pitch, cropRefWidth, cropRefPitch))
						maxX = x;
					else
						break;
				}

				if(gradientCrop) {
					cropRef = pixels.subarray((imgData.height-1)*pitch, pixels.length);
					cropRefWidth = imgData.width*4;
					cropRefPitch = 0;
				}

				offset = imgData.width*imgData.height*4;
				for(var y=imgData.height-1; y>=0; --y) {
					if(gradientCrop && allowDeviation && y < imgData.height-1)
						cropRef = pixels.subarray((y+1)*pitch, pixels.length);
					offset -= pitch;
					if(isFilled(pixels.subarray(offset, offset+pitch), cropRef, Math.min(cropRefWidth, pitch), cropRefWidth, cropRefPitch))
						minY = y;
					else
						break;
				}

				if(gradientCrop) {
					cropRef = pixels.subarray((imgData.width-1)*4, pixels.length);
					cropRefWidth = 4;
					cropRefPitch = pitch;
				}

				for(var x=imgData.width-1; x>=0; --x) {
					if(gradientCrop && allowDeviation && x < imgData.width-1)
						cropRef = pixels.subarray((x+1)*4, pixels.length);
					if(isFilled(pixels.subarray(x*4, pixels.length), cropRef, pitch, cropRefWidth, cropRefPitch))
						minX = x;
					else
						break;
				}

				if(gradientCrop) {
					// gradient crop always crops aways a 1 pixel border,
					// because it compares the row/column to itself
					// if this is all we crop, we don't crop
					if(minX == imgData.width-1)
						++minX;
					if(minY == imgData.height-1)
						++minY;
					if(maxX == 0)
						--maxX;
					if(maxY == 0)
						--maxY;
				}
			}

			++maxX;
			++maxY;
			var bw = +c.borderWidth.value;
			var lumWeights = [ 0.299, 0.587, 0.114 ].map(e => e/(255*255));
			var brightAtBorder = Math.sqrt(lumWeights.reduce((sum, weight, index) => sum + weight*ref[index]*ref[index], 0)) > 0.5;
			if(brightAtBorder) {
				var n = canvas.parentNode;
				while(n && !n.classList.contains("canvasHolder"))
					n = n.parentNode;
				n.classList.toggle("brightAtBorder", brightAtBorder);
			}
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
			var bindBarButton = bindClickForAll.bind(this, ownBar);

			tools.forEach(function(t) {
				bindBarButton(t.getButtonSelector(), function() {
					if(tool === t) {
						tool.select(false);
						tool = null;
					} else {
						if(tool)
							tool.select(false);
						tool = t;
						tool.select(true);
					}
					syncTool();
				});
			});

			bindBarButton(".saveJpgButton", function() {
				saveAsJPG(canvas, fn, parseFloat(qualityInput.value)/100);
			});
			bindBarButton(".savePngButton", function() {
				saveAsPNG(canvas, fn);
			});
			bindBarButton(".closeButton", function() {
				if(tool === null && panel.parentNode) {
					panel.parentNode.removeChild(panel);
				}
			});
			bindBarButton(".recropButton", function() {
				cropImage(canvas);
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
	var forceDataPopup = /\biPad\b|\biPhone\b|\biPod\b/g.test(window.navigator.userAgent);
	function handleBlob(blob) {
		var fr = new FileReader();
		fr.readAsArrayBuffer(blob);
		fr.onload = function(event) {
			var crc = crc32hex(new Uint8Array(event.target.result));
			var lastDot = filename.lastIndexOf(".");
			if (lastDot < 0) lastDot = filename.length;
			var blobUrl = DOMURL.createObjectURL(blob);
			var a = document.createElement("a");
			a.href = blobUrl;
			a.download = [filename.substring(0, lastDot),
				"_", crc, filename.substring(lastDot)].join("");
			a.click();
			DOMURL.revokeObjectURL(blobUrl);
		};
	}

	if(!forceDataPopup && typeof canvas.toBlob === "function") {
		try {
			canvas.toBlob(handleBlob, format, quality);
			return;
		} catch(e) {
			// don't worry, we'll do it old school
		}
	}
	var canvasDataUrl = canvas.toDataURL(format, quality);
	if(forceDataPopup) {
		window.open(canvasDataUrl);
	} else {
		var blob = dataURLToBlob(canvasDataUrl);
		handleBlob(blob);
	}
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

function handleDataTransferFiles(dataTransfer) {
	var files = Array.prototype.slice.call(dataTransfer.files);
	var foundFiles = false;
	files.forEach(function(f) {
		foundFiles = true;
		if(isImageMime(f.type)) {
			generate(f);
		}
	});
	return foundFiles;
}

window.addEventListener("DOMContentLoaded", function() {
	c.background.addEventListener("change", generate);
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
		handleDataTransferFiles(e.dataTransfer);
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

function exponentialSlider(expOffset, maxValue, range, numeric) {
	var offset = Math.exp(expOffset);
	var scale = (Math.log(maxValue+offset)-expOffset)/+range.max;
	bindValues(numeric, range,
		e => Math.round((Math.log(+e+offset)-expOffset)/scale));
	bindValues(range, numeric,
		e => Math.round(Math.exp(+e*scale+expOffset)-offset));
}

exponentialSlider(1, 64, c.borderWidthRange, c.borderWidth);
exponentialSlider(1, 255, c.differenceDeltaRange, c.differenceDelta);

function syncDeviation() {
	c.allowDeviation.disabled = !c.gradientCrop.checked || (+c.differenceDelta.value === 0);
}

c.gradientCrop.addEventListener("input", syncDeviation);
c.gradientCrop.addEventListener("change", syncDeviation);
c.differenceDelta.addEventListener("input", syncDeviation);
c.differenceDeltaRange.addEventListener("input", syncDeviation);

document.addEventListener("paste", function(event) {
	if(handleDataTransferFiles(event.clipboardData))
		return;
	for(var item of event.clipboardData.items) {
		if(item.kind == "file" && isImageMime(item.type)) {
			if(item.name)
				console.log("Found a file: ", item.name);
			generate(item.getAsFile());
		} else {
			console.log("Don't know what to do with this:", item.kind, item.type);
		}
	}
});

syncDeviation();
