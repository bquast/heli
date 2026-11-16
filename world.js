// world.js - the city: districts, buildings, ground, hills, freeway, trees, and the life in it
// (traffic, pedestrians, an airliner, a blimp, boats).
// Classic script. It uses THREE from three.min.js.
//
// main.js calls makeCity() one time and updateCity() each frame.
// game.js uses roofAt(), inZone(), clamp(), approach(), boxesGeometry(), makeRandom(),
//   newRoadCar(), moveRoadCar(), wreckCar(), dropPed(), scarePeds(), and the lists city.cars and city.peds.
//
// The map (north is -z, west is -x):
//   a grid of 120 m cells. A road is on each cell line. A block is in each cell.
//   west: the beach and the ocean.  north: the hills with the sign.
//   two raised freeways: one north-south, one east-west.
//   districts: downtown, a tower group in the west, a tower corridor between them, mid-rise, shops,
//   homes with pools, beach hotels, industry in the south-east, an airport in the south-west,
//   a stadium, a large park, and a concrete river in the east.
//
// Order of this file:
//   constants, helpers, shape builders, textures, heights, districts, block builders, special places,
//   ground, hills, freeway, trees and palms, traffic, pedestrians, air and sea, sky, make, update.

// ---------- constants ----------

var CELL = 120;          // m, one block and one road
var GRID = 36;           // cells in each direction
var HALF = 2160;         // m, half of the grid
var CITY_MIN = -1680;    // the city starts here (west and north edge)
var CITY_MAX = 2160;     // the city stops here (east and south edge)
var EDGE = 13.5;         // m from a road line to the block: the road and the sidewalk
var FWX = -1080;         // the north-south freeway is on this road line
var FWZ = 960;           // the east-west freeway is on this road line
var FW_Y = 12;           // m, height of the freeway deck
var FW_HALF = 13;        // m, half of the freeway width
var DOWNTOWN_X = 300;
var DOWNTOWN_Z = -120;
var RIVER_I = 29;        // the cell column of the concrete river
var MAX_ROOF = 340;      // m, nothing is higher than this
var CARS = 420;
var PEDS = 320;
var PED_SIDE = 11.7;     // m from a road line to the middle of the sidewalk

// places with no streets inside. Cars do not show there. [x0, x1, z0, z1]
var ZONES = [
	[-1548, -1094, 1212, 2200],      // airport
	[492, 708, -1068, -852],         // stadium
	[-468, -252, 492, 708]           // large park
];

var city = null;         // set by makeCity()

// ---------- helpers ----------

function clamp(v, lo, hi) {
	return v < lo ? lo : (v > hi ? hi : v);
}

// move v to target, but not more than step
function approach(v, target, step) {
	if (v < target) {
		return Math.min(v + step, target);
	}
	return Math.max(v - step, target);
}

// a random function with a seed, so the city is the same each time
function makeRandom(seed) {
	return function () {
		seed = (seed + 0x6D2B79F5) | 0;
		var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pick(rnd, list) {
	return list[Math.floor(rnd() * list.length)];
}

function inZone(x, z) {
	for (var i = 0; i < ZONES.length; i++) {
		var q = ZONES[i];
		if (x > q[0] && x < q[1] && z > q[2] && z < q[3]) {
			return true;
		}
	}
	return false;
}

// ---------- shape builders ----------

function newBuffer() {
	return { pos: [], nor: [], col: [], uv: [], idx: [] };
}

// one face. a, b, c, d go counter-clockwise when you look at the face from the outside.
function addQuad(buf, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, r, g, b, u0, v0, u1, v1) {
	var n = buf.pos.length / 3;
	buf.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
	buf.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
	buf.col.push(r, g, b, r, g, b, r, g, b, r, g, b);
	buf.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
	buf.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
}

var tmpColor = new THREE.Color();
var WHITE_UV = 0.004;    // a white point of each window texture

// a box. windows: true gives the walls the window texture. bottom: true adds the bottom face.
// uo, vo: where the window texture starts, so each building is different.
function addBox(buf, x0, x1, y0, y1, z0, z1, hex, windows, bottom, uo, vo) {
	tmpColor.setHex(hex);
	var r = tmpColor.r, g = tmpColor.g, b = tmpColor.b;
	var w = x1 - x0, h = y1 - y0, d = z1 - z0;
	// one unit of the texture is 8 windows: 32 m wide and 28 m high
	var uw = windows ? w / 32 : 0, ud = windows ? d / 32 : 0, vh = windows ? h / 28 : 0;
	if (!windows) {
		uo = WHITE_UV;
		vo = WHITE_UV;
	}
	addQuad(buf, x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, r, g, b, uo, vo, uo + ud, vo + vh);
	addQuad(buf, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, r, g, b, uo, vo, uo + ud, vo + vh);
	addQuad(buf, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, r, g, b, uo, vo, uo + uw, vo + vh);
	addQuad(buf, x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, r, g, b, uo, vo, uo + uw, vo + vh);
	// the roof of a building with windows is darker
	var k = windows ? 0.5 : 0.92;
	addQuad(buf, x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, r * k, g * k, b * k, WHITE_UV, WHITE_UV, WHITE_UV, WHITE_UV);
	if (bottom) {
		addQuad(buf, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, r * 0.6, g * 0.6, b * 0.6, WHITE_UV, WHITE_UV, WHITE_UV, WHITE_UV);
	}
}

// a cylinder that stands on y0. sides: the number of flat sides.
function addCylinder(buf, cx, cz, rad, y0, y1, hex, windows, sides, uo, vo) {
	tmpColor.setHex(hex);
	var r = tmpColor.r, g = tmpColor.g, b = tmpColor.b;
	var k = windows ? 0.5 : 0.92;
	var arc = Math.PI * 2 * rad / sides / 32, vh = windows ? (y1 - y0) / 28 : 0;
	for (var s = 0; s < sides; s++) {
		var a0 = s / sides * Math.PI * 2, a1 = (s + 1) / sides * Math.PI * 2, am = (a0 + a1) / 2;
		var x0 = cx + Math.cos(a0) * rad, z0 = cz + Math.sin(a0) * rad;
		var x1 = cx + Math.cos(a1) * rad, z1 = cz + Math.sin(a1) * rad;
		var u0 = windows ? uo + s * arc : WHITE_UV, u1 = windows ? uo + (s + 1) * arc : WHITE_UV;
		addQuad(buf, x1, y0, z1, x0, y0, z0, x0, y1, z0, x1, y1, z1, Math.cos(am), 0, Math.sin(am), r, g, b, u0, windows ? vo : WHITE_UV, u1, windows ? vo + vh : WHITE_UV);
		addQuad(buf, cx, y1, cz, x1, y1, z1, x0, y1, z0, cx, y1, cz, 0, 1, 0, r * k, g * k, b * k, WHITE_UV, WHITE_UV, WHITE_UV, WHITE_UV);
	}
}

// a roof with two slopes on top of a box. alongX: the top line of the roof goes along x.
function addGable(buf, x0, x1, z0, z1, y, rise, hex, alongX) {
	tmpColor.setHex(hex);
	var r = tmpColor.r, g = tmpColor.g, b = tmpColor.b, u = WHITE_UV;
	var top = y + rise;
	if (alongX) {
		var zm = (z0 + z1) / 2, half = z1 - zm, len = Math.sqrt(half * half + rise * rise);
		addQuad(buf, x0, y, z1, x1, y, z1, x1, top, zm, x0, top, zm, 0, half / len, rise / len, r, g, b, u, u, u, u);
		addQuad(buf, x1, y, z0, x0, y, z0, x0, top, zm, x1, top, zm, 0, half / len, -rise / len, r, g, b, u, u, u, u);
		addQuad(buf, x1, y, z1, x1, y, z0, x1, top, zm, x1, top, zm, 1, 0, 0, r * 0.8, g * 0.8, b * 0.8, u, u, u, u);
		addQuad(buf, x0, y, z0, x0, y, z1, x0, top, zm, x0, top, zm, -1, 0, 0, r * 0.8, g * 0.8, b * 0.8, u, u, u, u);
	} else {
		var xm = (x0 + x1) / 2, halfX = x1 - xm, lenX = Math.sqrt(halfX * halfX + rise * rise);
		addQuad(buf, x1, y, z1, x1, y, z0, xm, top, z0, xm, top, z1, rise / lenX, halfX / lenX, 0, r, g, b, u, u, u, u);
		addQuad(buf, x0, y, z0, x0, y, z1, xm, top, z1, xm, top, z0, -rise / lenX, halfX / lenX, 0, r, g, b, u, u, u, u);
		addQuad(buf, x0, y, z1, x1, y, z1, xm, top, z1, xm, top, z1, 0, 0, 1, r * 0.8, g * 0.8, b * 0.8, u, u, u, u);
		addQuad(buf, x1, y, z0, x0, y, z0, xm, top, z0, xm, top, z0, 0, 0, -1, r * 0.8, g * 0.8, b * 0.8, u, u, u, u);
	}
}

function toGeometry(buf) {
	var geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf.pos), 3));
	geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf.nor), 3));
	geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(buf.col), 3));
	geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf.uv), 2));
	geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf.idx), 1));
	return geo;
}

// a model from a list of boxes. Each box: [width, height, depth, x, y, z, color]. x, y, z is the center.
function boxesGeometry(list) {
	var buf = newBuffer();
	for (var i = 0; i < list.length; i++) {
		var b = list[i];
		addBox(buf, b[3] - b[0] / 2, b[3] + b[0] / 2, b[4] - b[1] / 2, b[4] + b[1] / 2, b[5] - b[2] / 2, b[5] + b[2] / 2, b[6], false, true, 0, 0);
	}
	return toGeometry(buf);
}

// The static city is in 16 parts (4 x 4), so the parts out of view are not drawn.
// style 0, 1, 2: walls with one of the 3 window textures.  style 3: no texture.
function bufFor(style, i, j) {
	var part = clamp(Math.floor((i - 4) / 8), 0, 3) * 4 + clamp(Math.floor((j - 4) / 8), 0, 3);
	var key = part * 4 + style;
	if (!city.bufs[key]) {
		city.bufs[key] = newBuffer();
	}
	return city.bufs[key];
}

// ---------- textures ----------

function canvasTexture(canvas) {
	var tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.wrapS = THREE.RepeatWrapping;
	tex.wrapT = THREE.RepeatWrapping;
	tex.anisotropy = 4;
	return tex;
}

// 8 x 8 windows on a white wall. The vertex color gives the wall its color.
//   style 0: office windows.  style 1: bands of glass.  style 2: apartments, with balconies.
function windowTexture(rnd, style) {
	var canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 256;
	var c = canvas.getContext('2d');
	c.fillStyle = '#ffffff';
	c.fillRect(0, 0, 256, 256);
	for (var j = 0; j < 8; j++) {
		if (style === 1) {
			c.fillStyle = '#41566f';
			c.fillRect(0, j * 32 + 9, 256, 16);
		}
		for (var i = 0; i < 8; i++) {
			var v = rnd();
			if (style === 0) {
				c.fillStyle = v < 0.12 ? '#ffd98a' : (v < 0.5 ? '#3d4c63' : '#55667e');
				c.fillRect(i * 32 + 7, j * 32 + 8, 19, 17);
			} else if (style === 1) {
				c.fillStyle = v < 0.1 ? '#ffe2a0' : (v < 0.5 ? '#4f6a88' : '#3a4d66');
				c.fillRect(i * 32 + 2, j * 32 + 9, 28, 16);
			} else if (v < 0.75) {
				c.fillStyle = v < 0.1 ? '#ffd98a' : '#4a5668';
				c.fillRect(i * 32 + 10, j * 32 + 8, 12, 14);
				if (v > 0.4) {
					c.fillStyle = '#8c8c8c';         // a balcony
					c.fillRect(i * 32 + 6, j * 32 + 22, 20, 4);
				}
			}
		}
	}
	return canvasTexture(canvas);
}

// one cell: the roads are on the 4 edges, the block is in the middle
function groundTexture() {
	var canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 256;
	var c = canvas.getContext('2d');
	c.fillStyle = '#3b3b3f';                // road
	c.fillRect(0, 0, 256, 256);
	c.fillStyle = '#a39e94';                // sidewalk
	c.fillRect(21, 21, 214, 214);
	c.fillStyle = '#6d695f';                // the ground of the block
	c.fillRect(29, 29, 198, 198);
	c.fillStyle = '#d8b84a';                // yellow center lines
	c.fillRect(0, 26, 1, 204);
	c.fillRect(255, 26, 1, 204);
	c.fillRect(26, 0, 204, 1);
	c.fillRect(26, 255, 204, 1);
	c.fillStyle = '#c9c9c9';                // white lane lines
	for (var k = 30; k < 226; k += 16) {
		c.fillRect(10, k, 1, 8);
		c.fillRect(245, k, 1, 8);
		c.fillRect(k, 10, 8, 1);
		c.fillRect(k, 245, 8, 1);
	}
	c.fillStyle = '#d0d0d0';                // crosswalks at the 4 corners
	for (var s = 0; s < 20; s += 4) {
		c.fillRect(22, 1 + s, 6, 2);
		c.fillRect(228, 1 + s, 6, 2);
		c.fillRect(22, 235 + s, 6, 2);
		c.fillRect(228, 235 + s, 6, 2);
		c.fillRect(1 + s, 22, 2, 6);
		c.fillRect(1 + s, 228, 2, 6);
		c.fillRect(235 + s, 22, 2, 6);
		c.fillRect(235 + s, 228, 2, 6);
	}
	return canvasTexture(canvas);
}

function signTexture() {
	var canvas = document.createElement('canvas');
	canvas.width = 1024;
	canvas.height = 128;
	var c = canvas.getContext('2d');
	c.fillStyle = '#ffffff';
	c.font = 'bold 120px Arial, Helvetica, sans-serif';
	c.textAlign = 'center';
	c.textBaseline = 'middle';
	c.fillText('H E L I   C I T Y', 512, 68);
	var tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

// ---------- heights ----------

// height of the hills in the north
function hillAt(x, z) {
	if (z > CITY_MIN || x < -1800) {
		return 0;
	}
	var t = clamp((CITY_MIN - z) / 1000, 0, 1);
	t = t * t * (3 - 2 * t);
	var e = clamp((x + 1800) / 500, 0, 1);
	var ridge = 0.62 + 0.2 * Math.sin(x * 0.0023 + 1.3) + 0.12 * Math.sin(x * 0.0061) + 0.1 * Math.sin(z * 0.004 + x * 0.002);
	return 300 * t * e * ridge;
}

// height of the top of the thing at x, z: a roof, the freeway, a hill, or 0 for the street.
// A lot is [x0, x1, z0, z1, top]. city.lots has a list for each cell. city.big has the large things.
function roofAt(x, z) {
	if (z < CITY_MIN) {
		return hillAt(x, z);
	}
	if (x < CITY_MIN || x >= CITY_MAX || z >= CITY_MAX) {
		return 0;
	}
	var h = 0, b;
	if (Math.abs(x - FWX) < FW_HALF || Math.abs(z - FWZ) < FW_HALF) {
		h = FW_Y + 0.6;
	}
	for (var n = 0; n < city.big.length; n++) {
		b = city.big[n];
		if (x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) {
			return Math.max(h, b[4]);
		}
	}
	var i = Math.floor((x + HALF) / CELL);
	var j = Math.floor((z + HALF) / CELL);
	var lots = city.lots[i * GRID + j];
	for (var k = 0; k < lots.length; k++) {
		b = lots[k];
		if (x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) {
			return Math.max(h, b[4]);
		}
	}
	return h;
}

// ---------- districts ----------

var GLASS = [0x7f98ad, 0x8aa0a8, 0x9aa7b5, 0x6f8494, 0xb0a79a, 0x5f7388, 0xa9b4bd, 0x4f6f7f, 0xc2b59a];
var STUCCO = [0xe8dcc4, 0xe2b79a, 0xd9c7a3, 0xf0ead8, 0xc9a58a, 0xbcd0c8, 0xe6c7b0, 0xd0d0c8, 0xd8a8a0, 0xa9c0d0];
var ROOFS = [0xa5553a, 0x9a4a35, 0x6b6b6e, 0x70513a, 0xbfb5a5, 0x4f4f55];
var LAWNS = [0x5d8444, 0x6f8f4a, 0x557a3f, 0x8f9455];
var SHEDS = [0x8a8f94, 0x6f7f8f, 0x9a6a4a, 0xb9b9b0, 0x5f6f66];
var BRIGHT = [0xe04a3a, 0x2f7fd0, 0xf0c030, 0x3aa860, 0xf08030, 0xffffff, 0xb040b0];
var CAR_COLORS = [0xf2f2f2, 0xd0d0d0, 0x2a2a2e, 0x1f3f6f, 0x8a8a8a, 0xc9b25a, 0x6a8a9a, 0xa33a2a, 0x3a3a3a, 0xe8e0c8];

// what is in the cell i, j. cx, cz: the center of the cell.
function districtAt(i, j, cx, cz, rnd) {
	if (i === RIVER_I) {
		return 'river';
	}
	if (i >= 5 && i <= 8 && j >= 28) {
		return 'airport';
	}
	if ((i === 22 || i === 23) && (j === 9 || j === 10)) {
		return 'stadium';
	}
	if ((i === 14 || i === 15) && (j === 22 || j === 23)) {
		return 'bigpark';
	}
	var d = Math.sqrt((cx - DOWNTOWN_X) * (cx - DOWNTOWN_X) + (cz - DOWNTOWN_Z) * (cz - DOWNTOWN_Z));
	var d2 = Math.sqrt((cx + 900) * (cx + 900) + (cz - 360) * (cz - 360));
	if (d < 380) {
		return 'downtown';
	}
	if (d2 < 260) {
		return 'towers';
	}
	if (d < 800) {
		return 'mid';
	}
	if (cx < -1300) {
		return 'beach';
	}
	if ((j === 16 || j === 17) && cx < DOWNTOWN_X) {
		return 'corridor';
	}
	if (i > RIVER_I && cz > 480) {
		return 'industry';
	}
	// shops are around the center and along each sixth street
	if (d < 1250 || j % 6 === 4 || j % 6 === 5 || i % 8 === 2) {
		return rnd() < 0.06 ? 'park' : 'shops';
	}
	return rnd() < 0.05 ? 'park' : 'homes';
}

// ---------- block builders ----------
// Each builder gets the cell i, j and the block x0..x1, z0..z1, and adds lots to the list.

function addTree(x, y, z, s) {
	city.trees.push(x, y, z, s);
}

// a high building. It has one of 4 shapes. It gives back the height of the top.
function addTower(i, j, rnd, x0, x1, z0, z1, h, color, style) {
	var buf = bufFor(style, i, j), plain = bufFor(3, i, j);
	var uo = Math.floor(rnd() * 8) / 8, vo = Math.floor(rnd() * 8) / 8;
	var w = x1 - x0, d = z1 - z0, shape = rnd();
	if (shape < 0.3) {
		// three steps
		var m1 = Math.min(w, d) * 0.13, m2 = Math.min(w, d) * 0.27;
		addBox(buf, x0, x1, 0, h * 0.55, z0, z1, color, true, false, uo, vo);
		addBox(buf, x0 + m1, x1 - m1, h * 0.55, h * 0.85, z0 + m1, z1 - m1, color, true, false, uo, vo);
		addBox(buf, x0 + m2, x1 - m2, h * 0.85, h, z0 + m2, z1 - m2, color, true, false, uo, vo);
		return h;
	}
	if (shape < 0.43) {
		// round
		var rad = Math.min(w, d) / 2;
		addCylinder(buf, (x0 + x1) / 2, (z0 + z1) / 2, rad, 0, h, color, true, 14, uo, vo);
		addCylinder(plain, (x0 + x1) / 2, (z0 + z1) / 2, rad * 0.5, h, h + 5, 0xc8c8c8, false, 10, 0, 0);
		return h + 5;
	}
	addBox(buf, x0, x1, 0, h, z0, z1, color, true, false, uo, vo);
	if (shape < 0.6) {
		// a mast
		var mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
		addBox(plain, mx - 4, mx + 4, h, h + 5, mz - 4, mz + 4, 0x8a8a8a, false, false, 0, 0);
		addBox(plain, mx - 0.8, mx + 0.8, h + 5, h + 5 + h * 0.18, mz - 0.8, mz + 0.8, 0xd04030, false, false, 0, 0);
		return h + 6;
	}
	// a smaller box on the roof
	var m = Math.min(w, d) * 0.25, e = 6 + rnd() * 18;
	addBox(buf, x0 + m, x1 - m, h, h + e, z0 + m, z1 - m, color, rnd() < 0.5, false, uo, vo);
	return h + e;
}

// a block of n x n high or mid buildings
function towerBlock(i, j, rnd, lots, x0, x1, z0, z1, n, hMin, hMax, colors, styles) {
	var sx = (x1 - x0) / n, sz = (z1 - z0) / n;
	for (var a = 0; a < n; a++) {
		for (var b = 0; b < n; b++) {
			var inset = 2 + rnd() * 4;
			var lx0 = x0 + a * sx + inset, lx1 = x0 + (a + 1) * sx - inset;
			var lz0 = z0 + b * sz + inset, lz1 = z0 + (b + 1) * sz - inset;
			var top = addTower(i, j, rnd, lx0, lx1, lz0, lz1, hMin + rnd() * (hMax - hMin), pick(rnd, colors), pick(rnd, styles));
			lots.push([lx0, lx1, lz0, lz1, top]);
		}
	}
}

// some cars that do not move
function addParkedCars(buf, rnd, x0, x1, z0, z1) {
	for (var x = x0 + 3; x < x1 - 3; x += 3.2) {
		if (rnd() < 0.6) {
			addBox(buf, x - 1, x + 1, 0, 1.3, z0 + 1, z0 + 5.4, pick(rnd, CAR_COLORS), false, false, 0, 0);
		}
		if (rnd() < 0.6 && z1 - z0 > 14) {
			addBox(buf, x - 1, x + 1, 0, 1.3, z1 - 5.4, z1 - 1, pick(rnd, CAR_COLORS), false, false, 0, 0);
		}
	}
}

// low shops and offices, with parking and some signs on the roofs
function shopBlock(i, j, rnd, lots, x0, x1, z0, z1) {
	var plain = bufFor(3, i, j);
	var n = 3, sx = (x1 - x0) / n, sz = (z1 - z0) / n;
	for (var a = 0; a < n; a++) {
		for (var b = 0; b < n; b++) {
			var lx0 = x0 + a * sx + 1.5, lx1 = x0 + (a + 1) * sx - 1.5;
			var lz0 = z0 + b * sz + 1.5, lz1 = z0 + (b + 1) * sz - 1.5;
			if (rnd() < 0.16) {
				addParkedCars(plain, rnd, lx0, lx1, lz0, lz1);
				continue;
			}
			var inset = rnd() * 3;
			lx0 += inset;
			lz0 += inset;
			lx1 -= rnd() * 3;
			lz1 -= rnd() * 3;
			var h = 5 + rnd() * 11, style = rnd() < 0.5 ? 2 : 0;
			addBox(bufFor(style, i, j), lx0, lx1, 0, h, lz0, lz1, pick(rnd, STUCCO), true, false, Math.floor(rnd() * 8) / 8, Math.floor(rnd() * 8) / 8);
			var top = h, mx = (lx0 + lx1) / 2, mz = (lz0 + lz1) / 2, v = rnd();
			if (v < 0.14) {
				// a sign on two legs
				addBox(plain, mx - 5, mx - 4.5, h, h + 3, mz - 0.2, mz + 0.2, 0x555555, false, false, 0, 0);
				addBox(plain, mx + 4.5, mx + 5, h, h + 3, mz - 0.2, mz + 0.2, 0x555555, false, false, 0, 0);
				addBox(plain, mx - 6, mx + 6, h + 3, h + 8, mz - 0.3, mz + 0.3, pick(rnd, BRIGHT), false, true, 0, 0);
				top = h + 8;
			} else if (v < 0.5) {
				// machines on the roof
				addBox(plain, mx - 3, mx + 1, h, h + 1.6, mz - 2, mz + 2, 0x9a9a9a, false, false, 0, 0);
				top = h + 1.6;
			}
			lots.push([lx0, lx1, lz0, lz1, top]);
		}
	}
}

// houses with gardens, pools and trees
function homeBlock(i, j, rnd, lots, x0, x1, z0, z1, big) {
	var plain = bufFor(3, i, j);
	addBox(plain, x0, x1, 0, 0.5, z0, z1, pick(rnd, LAWNS), false, false, 0, 0);
	var n = big ? 2 : 3, sx = (x1 - x0) / n, sz = (z1 - z0) / n;
	for (var a = 0; a < n; a++) {
		for (var b = 0; b < n; b++) {
			var lx = x0 + a * sx, lz = z0 + b * sz;
			var w = (big ? 16 : 11) + rnd() * 6, d = (big ? 13 : 9) + rnd() * 5;
			var hx = lx + 2 + rnd() * (sx - w - 4), hz = lz + 2 + rnd() * (sz - d - 4);
			var h = rnd() < 0.3 ? 6.5 : 3.8, rise = 1.6 + rnd() * 1.2;
			addBox(plain, hx, hx + w, 0.5, 0.5 + h, hz, hz + d, pick(rnd, STUCCO), false, false, 0, 0);
			addGable(plain, hx - 0.5, hx + w + 0.5, hz - 0.5, hz + d + 0.5, 0.5 + h, rise, pick(rnd, ROOFS), rnd() < 0.5);
			lots.push([hx, hx + w, hz, hz + d, 0.5 + h + rise]);
			// the garden is the part of the lot that the house does not use
			var gx = hx - lx > lx + sx - hx - w ? lx + 2 : hx + w + 1.5;
			var gw = Math.max(hx - lx, lx + sx - hx - w) - 3.5;
			if (gw > 6 && rnd() < (big ? 0.7 : 0.3)) {
				var pz = hz + rnd() * Math.max(0, d - 9);
				addBox(plain, gx, gx + 6, 0.5, 0.9, pz, pz + 9, 0xd8d0c0, false, false, 0, 0);
				addBox(plain, gx + 0.8, gx + 5.2, 0.9, 1.2, pz + 0.8, pz + 8.2, 0x3fb8c8, false, false, 0, 0);
			} else if (gw > 4 && rnd() < 0.8) {
				addTree(gx + gw / 2, 0.5, hz + rnd() * d, 0.8 + rnd() * 0.7);
			}
			if (rnd() < 0.35) {
				addTree(lx + 2 + rnd() * (sx - 4), 0.5, lz + sz - 3, 0.8 + rnd() * 0.6);
			}
		}
	}
}

// large sheds, tanks and containers
function industryBlock(i, j, rnd, lots, x0, x1, z0, z1) {
	var plain = bufFor(3, i, j);
	var n = 2, sx = (x1 - x0) / n, sz = (z1 - z0) / n;
	for (var a = 0; a < n; a++) {
		for (var b = 0; b < n; b++) {
			var lx0 = x0 + a * sx + 2, lx1 = x0 + (a + 1) * sx - 2;
			var lz0 = z0 + b * sz + 2, lz1 = z0 + (b + 1) * sz - 2;
			var v = rnd();
			if (v < 0.2) {
				// tanks
				var rad = 7 + rnd() * 3;
				for (var t = 0; t < 2; t++) {
					addCylinder(plain, lx0 + rad + 1 + t * (rad * 2 + 3), (lz0 + lz1) / 2, rad, 0, 11 + rnd() * 4, 0xe6e6e0, false, 10, 0, 0);
				}
				lots.push([lx0, lx1, lz0, lz1, 15]);
			} else if (v < 0.42) {
				// containers
				for (var cz = lz0 + 2; cz < lz1 - 3; cz += 3.2) {
					for (var cxx = lx0 + 1; cxx < lx1 - 13; cxx += 13.5) {
						if (rnd() < 0.75) {
							var high = 2.6 * (1 + Math.floor(rnd() * 3));
							addBox(plain, cxx, cxx + 12.2, 0, high, cz, cz + 2.5, pick(rnd, BRIGHT), false, false, 0, 0);
						}
					}
				}
				lots.push([lx0, lx1, lz0, lz1, 8]);
			} else {
				// a shed with a light roof and windows in the roof
				var h = 8 + rnd() * 6;
				addBox(plain, lx0, lx1, 0, h, lz0, lz1, pick(rnd, SHEDS), false, false, 0, 0);
				addBox(plain, lx0 + 1, lx1 - 1, h, h + 0.3, lz0 + 1, lz1 - 1, 0xd0cfc8, false, false, 0, 0);
				for (var s = lx0 + 6; s < lx1 - 6; s += 9) {
					addBox(plain, s, s + 2, h + 0.3, h + 1, lz0 + 4, lz1 - 4, 0x8fb0c0, false, false, 0, 0);
				}
				lots.push([lx0, lx1, lz0, lz1, h + 1]);
			}
		}
	}
}

function parkBlock(i, j, rnd, lots, x0, x1, z0, z1) {
	addBox(bufFor(3, i, j), x0, x1, 0, 0.6, z0, z1, 0x4f7a3a, false, false, 0, 0);
	for (var q = 0; q < 12; q++) {
		addTree(x0 + 5 + rnd() * (x1 - x0 - 10), 0.6, z0 + 5 + rnd() * (z1 - z0 - 10), 1 + rnd() * 0.9);
	}
	for (var p = 0; p < 4; p++) {
		city.palms.push(x0 + 8 + rnd() * (x1 - x0 - 16), 0.6, z0 + 8 + rnd() * (z1 - z0 - 16));
	}
}

// the concrete river: the roads go across it between the cells
function riverBlock(i, j, lots, x0, z0) {
	var plain = bufFor(3, i, j);
	addBox(plain, x0 + EDGE, x0 + CELL - EDGE, 0, 0.4, z0 + 10.5, z0 + CELL - 10.5, 0xb3aea4, false, false, 0, 0);
	addBox(plain, x0 + 50, x0 + 70, 0.4, 0.7, z0 + 10.5, z0 + CELL - 10.5, 0x4f8f8f, false, false, 0, 0);
}

// all blocks of the grid
function makeBlocks(rnd) {
	for (var i = 0; i < GRID; i++) {
		for (var j = 0; j < GRID; j++) {
			var lots = [];
			city.lots[i * GRID + j] = lots;
			var cx0 = -HALF + i * CELL, cz0 = -HALF + j * CELL;
			if (cx0 < CITY_MIN || cz0 < CITY_MIN) {
				continue;                    // beach, ocean or hills
			}
			// the block is smaller next to a freeway
			var x0 = cx0 + (cx0 === FWX ? 19 : EDGE), x1 = cx0 + CELL - (cx0 + CELL === FWX ? 19 : EDGE);
			var z0 = cz0 + (cz0 === FWZ ? 19 : EDGE), z1 = cz0 + CELL - (cz0 + CELL === FWZ ? 19 : EDGE);
			var kind = districtAt(i, j, cx0 + CELL / 2, cz0 + CELL / 2, rnd);
			var d = Math.sqrt((cx0 + 60 - DOWNTOWN_X) * (cx0 + 60 - DOWNTOWN_X) + (cz0 + 60 - DOWNTOWN_Z) * (cz0 + 60 - DOWNTOWN_Z));
			if (kind === 'downtown') {
				towerBlock(i, j, rnd, lots, x0, x1, z0, z1, rnd() < 0.5 ? 1 : 2, 70, 90 + 210 * (1 - d / 500), GLASS, [0, 1, 1]);
			} else if (kind === 'towers') {
				towerBlock(i, j, rnd, lots, x0, x1, z0, z1, 2, 50, 140, GLASS, [0, 1]);
			} else if (kind === 'corridor') {
				towerBlock(i, j, rnd, lots, x0, x1, z0, z1, 2, 26, 95, GLASS.concat(STUCCO), [0, 1, 2]);
			} else if (kind === 'mid') {
				towerBlock(i, j, rnd, lots, x0, x1, z0, z1, 2, 18, 72 - d * 0.03, GLASS.concat(STUCCO), [0, 1, 2, 2]);
			} else if (kind === 'beach') {
				towerBlock(i, j, rnd, lots, x0, x1, z0, z1, 2, 12, 42, [0xf0ead8, 0xe8dcc4, 0xbcd0c8, 0xf4f4f0, 0xe6c7b0], [2]);
			} else if (kind === 'shops') {
				shopBlock(i, j, rnd, lots, x0, x1, z0, z1);
			} else if (kind === 'homes') {
				homeBlock(i, j, rnd, lots, x0, x1, z0, z1, j < 7);       // large houses near the hills
			} else if (kind === 'industry') {
				industryBlock(i, j, rnd, lots, x0, x1, z0, z1);
			} else if (kind === 'park') {
				parkBlock(i, j, rnd, lots, x0, x1, z0, z1);
			} else if (kind === 'river') {
				riverBlock(i, j, lots, cx0, cz0);
			}
			// airport, stadium and bigpark: makePlaces() builds them
		}
	}
}

// ---------- special places ----------

// an airliner on the ground, the nose to the east
function addParkedPlane(buf, x, z, tail) {
	addBox(buf, x - 18, x + 18, 3, 7, z - 2, z + 2, 0xf2f2f2, false, true, 0, 0);
	addBox(buf, x - 4, x + 3, 3.4, 4, z - 17, z + 17, 0xdadada, false, true, 0, 0);
	addBox(buf, x - 18, x - 13, 7, 13, z - 0.3, z + 0.3, tail, false, true, 0, 0);
	addBox(buf, x - 18, x - 14, 6, 6.5, z - 6, z + 6, 0xdadada, false, true, 0, 0);
}

function makePlaces(rnd) {
	var buf, x, z, k;

	// the airport: one runway north-south, a terminal and a tower
	buf = bufFor(3, 6, 30);
	addBox(buf, -1548, -1094, 0, 0.3, 1212, 2160, 0x8f9a6a, false, false, 0, 0);            // grass
	addBox(buf, -1463, -1417, 0.3, 0.6, 1250, 2140, 0x3a3a3e, false, false, 0, 0);          // runway
	for (z = 1290; z < 2110; z += 60) {
		addBox(buf, -1441, -1439, 0.6, 0.75, z, z + 30, 0xf0f0f0, false, false, 0, 0);
	}
	addBox(buf, -1370, -1345, 0.3, 0.55, 1250, 2140, 0x55555a, false, false, 0, 0);         // taxiway
	addBox(buf, -1345, -1100, 0.3, 0.55, 1330, 2010, 0x77777c, false, false, 0, 0);         // apron
	addBox(bufFor(1, 6, 30), -1170, -1108, 0.55, 17, 1400, 1950, 0xd8d8d0, true, false, 0, 0);
	city.big.push([-1170, -1108, 1400, 1950, 17]);
	addCylinder(buf, -1210, 1300, 5, 0.3, 42, 0xd0d0d0, false, 10, 0, 0);
	addCylinder(bufFor(1, 6, 30), -1210, 1300, 8, 42, 48, 0x6f8494, true, 10, 0, 0);
	city.big.push([-1218, -1202, 1292, 1308, 48]);
	for (k = 0; k < 4; k++) {
		addParkedPlane(buf, -1240, 1480 + k * 125, BRIGHT[k]);
	}
	city.big.push([-1548, -1094, 1212, 2160, 0.6]);

	// the stadium: a round bowl in a car park
	buf = bufFor(3, 22, 9);
	addBox(buf, 492, 708, 0, 0.4, -1068, -852, 0x47474b, false, false, 0, 0);
	addCylinder(buf, 600, -960, 76, 0.4, 26, 0xc9c4b8, false, 24, 0, 0);
	addCylinder(buf, 600, -960, 70, 26, 26.4, 0x4a6aa0, false, 24, 0, 0);                   // seats
	addCylinder(buf, 600, -960, 48, 26.4, 26.8, 0x3a5a8a, false, 24, 0, 0);
	addBox(buf, 566, 634, 26.8, 27.2, -1004, -916, 0x3f8f3f, false, false, 0, 0);           // field
	addBox(buf, 569, 631, 27.2, 27.4, -961, -959, 0xf0f0f0, false, false, 0, 0);
	for (k = 0; k < 4; k++) {
		x = 600 + (k % 2 === 0 ? -82 : 82);
		z = -960 + (k < 2 ? -82 : 82);
		addBox(buf, x - 1, x + 1, 0.4, 46, z - 1, z + 1, 0x8a8a8a, false, false, 0, 0);
		addBox(buf, x - 5, x + 5, 46, 50, z - 1, z + 1, 0xf4f4e0, false, true, 0, 0);
	}
	for (z = -1064; z < -1040; z += 12) {
		addParkedCars(buf, rnd, 496, 704, z, z + 11);
		addParkedCars(buf, rnd, 496, 704, z + 190, z + 201);
	}
	city.big.push([524, 676, -1036, -884, 27.4]);
	city.big.push([492, 708, -1068, -852, 0.4]);

	// the large park with a pond
	buf = bufFor(3, 14, 22);
	addBox(buf, -468, -252, 0, 0.6, 492, 708, 0x4f7a3a, false, false, 0, 0);
	addCylinder(buf, -330, 640, 34, 0.6, 0.9, 0x3f8fa8, false, 16, 0, 0);
	addBox(buf, -468, -252, 0.6, 0.8, 598, 602, 0xcbbf9f, false, false, 0, 0);
	addBox(buf, -402, -398, 0.6, 0.8, 492, 708, 0xcbbf9f, false, false, 0, 0);
	for (k = 0; k < 90; k++) {
		x = -462 + rnd() * 204;
		z = 498 + rnd() * 204;
		var inPond = (x + 330) * (x + 330) + (z - 640) * (z - 640) < 38 * 38;
		if (!inPond && Math.abs(z - 600) > 5 && Math.abs(x + 400) > 5) {
			addTree(x, 0.6, z, 1 + rnd());
		}
	}
	city.big.push([-468, -252, 492, 708, 0.9]);
}

// ---------- ground ----------

function flatPlane(x0, x1, z0, z1, material) {
	var geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
	geo.rotateX(-Math.PI / 2);
	var mesh = new THREE.Mesh(geo, material);
	mesh.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
	return mesh;
}

// the planes do not go one above the other, so there is no flicker from far away
function makeGround(group) {
	var tex = groundTexture();
	var cells = (CITY_MAX - CITY_MIN) / CELL;
	tex.repeat.set(cells, cells);
	group.add(flatPlane(CITY_MIN, CITY_MAX, CITY_MIN, CITY_MAX, new THREE.MeshLambertMaterial({ map: tex })));
	var far = new THREE.MeshLambertMaterial({ color: 0x6f6a60 });
	group.add(flatPlane(CITY_MAX, 9000, CITY_MIN, 9000, far));           // east
	group.add(flatPlane(CITY_MIN, CITY_MAX, CITY_MAX, 9000, far));       // south
	group.add(flatPlane(-1800, CITY_MIN, CITY_MIN, 9000, new THREE.MeshLambertMaterial({ color: 0xd9c79a })));   // sand
	group.add(flatPlane(-9000, -1800, -9000, 9000, new THREE.MeshLambertMaterial({ color: 0x2c6f8f })));         // ocean
}

// the beach and the pier with the big wheel
function makeCoast(group, rnd, material) {
	var buf = newBuffer();
	addBox(buf, -2050, -1700, 5, 6, 180, 206, 0x8a6f4d, false, true, 0, 0);
	for (var x = -2040; x <= -1720; x += 40) {
		addBox(buf, x - 1, x + 1, 0, 5, 181, 183, 0x5a4a38, false, false, 0, 0);
		addBox(buf, x - 1, x + 1, 0, 5, 203, 205, 0x5a4a38, false, false, 0, 0);
	}
	addBox(buf, -1991, -1989, 6, 42, 185, 187, 0xd8d8d8, false, false, 0, 0);
	addBox(buf, -1991, -1989, 6, 42, 199, 201, 0xd8d8d8, false, false, 0, 0);
	addBox(buf, -1960, -1900, 6, 10, 183, 203, 0xe8dcc4, false, false, 0, 0);
	// the line where the waves stop, and the sun shades
	addBox(buf, -1812, -1800, 0, 0.3, CITY_MIN, 6000, 0xf4f4f0, false, false, 0, 0);
	for (var z = CITY_MIN + 20; z < CITY_MAX; z += 7 + rnd() * 30) {
		var ux = -1790 + rnd() * 80;
		addBox(buf, ux - 1.6, ux + 1.6, 2, 2.3, z - 1.6, z + 1.6, pick(rnd, BRIGHT), false, true, 0, 0);
		addBox(buf, ux - 0.1, ux + 0.1, 0, 2, z - 0.1, z + 0.1, 0xdddddd, false, false, 0, 0);
	}
	group.add(new THREE.Mesh(toGeometry(buf), material));
	var wheel = new THREE.Group();
	wheel.add(new THREE.Mesh(new THREE.TorusGeometry(28, 0.8, 6, 28), new THREE.MeshLambertMaterial({ color: 0xe05a4a })));
	wheel.add(new THREE.Mesh(boxesGeometry([[56, 0.5, 0.5, 0, 0, 0, 0xf0f0f0], [0.5, 56, 0.5, 0, 0, 0, 0xf0f0f0]]), material));
	wheel.position.set(-1990, 40, 193);
	wheel.rotation.y = Math.PI / 2;
	group.add(wheel);
	return wheel;
}

// ---------- hills ----------

function makeHills(group, rnd, material) {
	var nx = 78, nz = 28;
	var pos = [], col = [], idx = [];
	for (var j = 0; j <= nz; j++) {
		for (var i = 0; i <= nx; i++) {
			var x = -1800 + i * 100, z = CITY_MIN - j * 90;
			pos.push(x, hillAt(x, z), z);
			var v = 0.5 + 0.5 * Math.sin(x * 0.013 + z * 0.021) * Math.sin(z * 0.017);
			tmpColor.setHex(0x6b6a3c).lerp(new THREE.Color(0x9a8355), v);
			col.push(tmpColor.r, tmpColor.g, tmpColor.b);
		}
	}
	for (var b = 0; b < nz; b++) {
		for (var a = 0; a < nx; a++) {
			var p = b * (nx + 1) + a;
			idx.push(p, p + 1, p + nx + 2, p, p + nx + 2, p + nx + 1);
		}
	}
	var geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
	geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
	geo.setIndex(idx);
	geo.computeVertexNormals();
	group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));

	// bushes
	for (var k = 0; k < 600; k++) {
		var bx = -1500 + rnd() * 4000, bz = CITY_MIN - 30 - rnd() * 1100;
		addTree(bx, hillAt(bx, bz) - 1.5, bz, 0.9 + rnd() * 1.3);
	}

	// the sign
	var sign = new THREE.Mesh(new THREE.PlaneGeometry(300, 38), new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true, alphaTest: 0.5 }));
	sign.position.set(DOWNTOWN_X, hillAt(DOWNTOWN_X, -2250) + 26, -2250);
	group.add(sign);

	// a white building with a dome, and a radio mast
	var buf = newBuffer();
	var oy = hillAt(-500, -2150);
	addBox(buf, -530, -470, oy - 4, oy + 9, -2165, -2135, 0xf0ece0, false, false, 0, 0);
	var my = hillAt(1300, -2600);
	addBox(buf, 1299, 1301, my, my + 70, -2601, -2599, 0xd04030, false, false, 0, 0);
	addBox(buf, 1297, 1303, my + 40, my + 42, -2603, -2597, 0xf0f0f0, false, true, 0, 0);
	group.add(new THREE.Mesh(toGeometry(buf), material));
	var dome = new THREE.Mesh(new THREE.SphereGeometry(11, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a9aa0 }));
	dome.position.set(-500, oy + 9, -2150);
	group.add(dome);
}

// ---------- freeway ----------

function makeFreeways(group, material) {
	var list = [];
	var len = CITY_MAX - CITY_MIN, mid = (CITY_MAX + CITY_MIN) / 2;
	list.push([FW_HALF * 2, 1.4, len, FWX, FW_Y - 0.7, mid, 0x4a4a4e]);
	list.push([len, 1.4, FW_HALF * 2, mid, FW_Y - 0.72, FWZ, 0x4a4a4e]);
	list.push([0.6, 0.3, len, FWX, FW_Y + 0.1, mid, 0xb8b8b8]);       // the wall in the middle
	list.push([len, 0.3, 0.6, mid, FW_Y + 0.1, FWZ, 0xb8b8b8]);
	for (var p = CITY_MIN + 60; p < CITY_MAX; p += 120) {
		list.push([3, FW_Y - 1.4, 3, FWX, (FW_Y - 1.4) / 2, p, 0x77746e]);
		list.push([3, FW_Y - 1.4, 3, p, (FW_Y - 1.4) / 2, FWZ, 0x77746e]);
		// green signs above the lanes
		if ((p - CITY_MIN - 60) % 480 === 0) {
			list.push([FW_HALF * 2, 0.4, 0.4, FWX, FW_Y + 7, p, 0x77746e]);
			list.push([9, 3, 0.3, FWX - 6, FW_Y + 5.5, p, 0x2f7a4a]);
			list.push([0.4, 0.4, FW_HALF * 2, p, FW_Y + 7, FWZ, 0x77746e]);
			list.push([0.3, 3, 9, p, FW_Y + 5.5, FWZ + 6, 0x2f7a4a]);
		}
	}
	group.add(new THREE.Mesh(boxesGeometry(list), material));
}

// ---------- trees and palms ----------

// city.trees: a flat list of x, y, z, size.  city.palms: a flat list of x, y, z.
function makeTrees(group, rnd) {
	var j, x, z, m;
	// palms along each sixth east-west street, and trees along some other streets
	for (j = 5; j < GRID; j++) {
		z = -HALF + j * CELL;
		if (j % 6 !== 5 && j % 3 !== 1) {
			continue;
		}
		for (x = CITY_MIN + 6; x < CITY_MAX; x += (j % 6 === 5 ? 24 : 36)) {
			m = ((x + HALF) % CELL + CELL) % CELL;
			if (m < 15 || m > CELL - 15 || inZone(x, z - 20) || inZone(x, z + 20)) {
				continue;                    // a crossing, or a place with no streets
			}
			if (j % 6 === 5) {
				city.palms.push(x, 0, z - 12.6);
				city.palms.push(x + 12, 0, z + 12.6);
			} else {
				addTree(x, 0, z - 12.6, 0.8 + rnd() * 0.4);
				addTree(x + 18, 0, z + 12.6, 0.8 + rnd() * 0.4);
			}
		}
	}
	// palms along the beach
	for (var bz = CITY_MIN + 10; bz < CITY_MAX; bz += 22) {
		city.palms.push(-1696 - rnd() * 8, 0, bz);
	}

	var dummy = new THREE.Object3D();
	var count = city.palms.length / 3;
	var trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 13, 5, 1, true);
	trunkGeo.translate(0, 6.5, 0);
	var crownGeo = new THREE.SphereGeometry(4.2, 6, 2);
	crownGeo.scale(1, 0.4, 1);
	crownGeo.translate(0, 13.6, 0);
	var trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a644a }), count);
	var crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x3f7a35 }), count);
	for (var i = 0; i < count; i++) {
		dummy.position.set(city.palms[i * 3], city.palms[i * 3 + 1], city.palms[i * 3 + 2]);
		dummy.scale.set(1, 0.8 + rnd() * 0.5, 1);
		dummy.updateMatrix();
		trunks.setMatrixAt(i, dummy.matrix);
		crowns.setMatrixAt(i, dummy.matrix);
	}
	group.add(trunks);
	group.add(crowns);

	// the round trees are in 4 groups (north-west, north-east, south-west, south-east)
	var treeGeo = new THREE.IcosahedronGeometry(2.7, 0);
	treeGeo.scale(1, 0.85, 1);
	treeGeo.translate(0, 3, 0);
	var treeMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
	var greens = [0x3f6f2f, 0x4f7f35, 0x355f2a, 0x5f8a3a, 0x6f7f3a];
	var lists = [[], [], [], []];
	for (var t = 0; t < city.trees.length; t += 4) {
		lists[(city.trees[t] > 240 ? 1 : 0) + (city.trees[t + 2] > 240 ? 2 : 0)].push(t);
	}
	for (var q = 0; q < 4; q++) {
		var mesh = new THREE.InstancedMesh(treeGeo, treeMat, lists[q].length);
		for (var n = 0; n < lists[q].length; n++) {
			var o = lists[q][n];
			dummy.position.set(city.trees[o], city.trees[o + 1], city.trees[o + 2]);
			dummy.scale.setScalar(city.trees[o + 3]);
			dummy.updateMatrix();
			mesh.setMatrixAt(n, dummy.matrix);
			mesh.setColorAt(n, tmpColor.setHex(pick(rnd, greens)));
		}
		group.add(mesh);
	}
}

// ---------- traffic ----------

// A car is on a road line.
//   axis 0: it moves along x, on the road at z = line.   axis 1: it moves along z, on the road at x = line.
//   dir: +1 or -1.   lane: m from the center of the road, to the right.   baseY: 0, or the freeway deck.
//   hp: a civil car explodes at 0.   dead: s that the wreck stays.
// game.js uses the same record for the enemy vans and the police cars.
function newRoadCar(rnd, freeway) {
	var car = {
		axis: rnd() < 0.5 ? 0 : 1, line: 0, pos: 0, dir: rnd() < 0.5 ? 1 : -1, lane: 3.5, speed: 9 + rnd() * 6,
		x: 0, y: 0, z: 0, yaw: 0, baseY: 0.05, hp: 30, dead: 0, long: 1, tall: 1, color: 0xffffff
	};
	if (freeway) {
		car.line = car.axis === 0 ? FWZ : FWX;
		car.lane = rnd() < 0.5 ? 3.5 : 8.5;
		car.speed = 24 + rnd() * 8;
		car.baseY = FW_Y + 0.05;
	} else {
		car.line = CITY_MIN + CELL * (1 + Math.floor(rnd() * 31));
	}
	car.pos = CITY_MIN + rnd() * (CITY_MAX - CITY_MIN);
	return car;
}

// set x, z and yaw from the place on the road
function roadPlace(car) {
	if (car.axis === 0) {
		car.x = car.pos;
		car.z = car.line + car.lane * car.dir;
		car.yaw = -car.dir * Math.PI / 2;
	} else {
		car.z = car.pos;
		car.x = car.line - car.lane * car.dir;
		car.yaw = car.dir > 0 ? Math.PI : 0;
	}
}

// move the car. At a place with no streets: bounce true turns the car back, bounce false hides it.
function moveRoadCar(car, dt, bounce) {
	var old = car.pos;
	car.pos += car.dir * car.speed * dt;
	if (car.pos > CITY_MAX) {
		car.pos = bounce ? CITY_MAX : CITY_MIN;
		car.dir = bounce ? -1 : car.dir;
	}
	if (car.pos < CITY_MIN) {
		car.pos = bounce ? CITY_MIN : CITY_MAX;
		car.dir = bounce ? 1 : car.dir;
	}
	roadPlace(car);
	car.y = car.baseY;
	if (car.baseY < 1 && inZone(car.x, car.z)) {
		if (bounce) {
			car.pos = old;
			car.dir = -car.dir;
			roadPlace(car);
		} else {
			car.y = -20;
		}
	}
}

function makeTraffic(group, rnd) {
	var geo = boxesGeometry([[2, 0.8, 4.6, 0, 0.6, 0, 0xffffff], [1.8, 0.6, 2.4, 0, 1.3, 0.2, 0x30343a]]);
	var mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), CARS);
	mesh.frustumCulled = false;
	for (var i = 0; i < CARS; i++) {
		var car = newRoadCar(rnd, i < 90);
		var v = rnd();
		car.color = pick(rnd, CAR_COLORS);
		if (v < 0.07) {
			car.long = 2.5;                  // a bus
			car.tall = 1.7;
			car.color = rnd() < 0.5 ? 0xe07a2a : 0xf0f0f0;
		} else if (v < 0.17) {
			car.long = 1.9;                  // a truck
			car.tall = 1.8;
			car.color = pick(rnd, [0xf4f4f4, 0xd8d8d8, 0x9a3a2a, 0x2f5f8f]);
		} else if (v < 0.25) {
			car.color = 0xf0c020;            // a taxi
		}
		city.cars.push(car);
		mesh.setColorAt(i, tmpColor.setHex(car.color));
	}
	city.carMesh = mesh;
	group.add(mesh);
}

// a civil car becomes a black wreck. After some time a new car comes in its place.
function wreckCar(car) {
	car.dead = 25;
	city.carMesh.setColorAt(city.cars.indexOf(car), tmpColor.setHex(0x151515));
	city.carMesh.instanceColor.needsUpdate = true;
}

function updateTraffic(dt) {
	var dummy = city.dummy;
	dummy.rotation.set(0, 0, 0);
	for (var i = 0; i < city.cars.length; i++) {
		var car = city.cars[i];
		if (car.dead > 0) {
			car.dead -= dt;
			if (car.dead <= 0) {
				car.hp = 30;
				car.pos = CITY_MIN + city.rnd() * (CITY_MAX - CITY_MIN);
				city.carMesh.setColorAt(i, tmpColor.setHex(car.color));
				city.carMesh.instanceColor.needsUpdate = true;
			}
		} else {
			moveRoadCar(car, dt, false);
		}
		dummy.position.set(car.x, car.y, car.z);
		dummy.rotation.y = car.yaw;
		dummy.scale.set(1, car.tall, car.long);
		dummy.updateMatrix();
		city.carMesh.setMatrixAt(i, dummy.matrix);
	}
	city.carMesh.instanceMatrix.needsUpdate = true;
}

// ---------- pedestrians ----------

// The pedestrians are only near the player. A pedestrian walks on a sidewalk.
//   axis, line, pos, dir: as a car.   side: +1 or -1, the side of the road.
//   state 0: walk.  state 1: run away.  state 2: down.   t: s to the end of the state.
function placePed(ped, px, pz) {
	var rnd = city.rnd;
	for (var tries = 0; tries < 8; tries++) {
		ped.axis = rnd() < 0.5 ? 0 : 1;
		var across = ped.axis === 0 ? pz : px, along = ped.axis === 0 ? px : pz;
		ped.line = CITY_MIN + CELL * clamp(Math.round((across - CITY_MIN) / CELL) + Math.floor(rnd() * 5) - 2, 0, 32);
		ped.pos = clamp(along + (rnd() - 0.5) * 620, CITY_MIN + 15, CITY_MAX - 15);
		ped.side = rnd() < 0.5 ? 1 : -1;
		ped.dir = rnd() < 0.5 ? 1 : -1;
		ped.speed = 1.1 + rnd() * 0.7;
		ped.state = 0;
		pedPlace(ped);
		if (!inZone(ped.x, ped.z) && ped.x > CITY_MIN && ped.z > CITY_MIN) {
			return;
		}
	}
}

function pedPlace(ped) {
	if (ped.axis === 0) {
		ped.x = ped.pos;
		ped.z = ped.line + ped.side * PED_SIDE;
		ped.yaw = -ped.dir * Math.PI / 2;
	} else {
		ped.z = ped.pos;
		ped.x = ped.line + ped.side * PED_SIDE;
		ped.yaw = ped.dir > 0 ? Math.PI : 0;
	}
}

function makePeds(group, rnd, px, pz) {
	var geo = boxesGeometry([[0.75, 1.35, 0.5, 0, 0.68, 0, 0xffffff], [0.45, 0.45, 0.45, 0, 1.6, 0, 0xc9a58a]]);
	var mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), PEDS);
	mesh.frustumCulled = false;
	var colors = [0xf0f0f0, 0x2f4f8f, 0xc03a3a, 0x3a3a3a, 0xe0c040, 0x4a9a5a, 0xd08a4a, 0x8a5aa0, 0x9ad0e0, 0xf0a0b0];
	for (var i = 0; i < PEDS; i++) {
		var ped = { axis: 0, line: 0, pos: 0, dir: 1, side: 1, speed: 1, state: 0, t: 0, x: 0, z: 0, yaw: 0 };
		placePed(ped, px, pz);
		city.peds.push(ped);
		mesh.setColorAt(i, tmpColor.setHex(pick(rnd, colors)));
	}
	city.pedMesh = mesh;
	group.add(mesh);
}

// the pedestrian is down
function dropPed(ped) {
	ped.state = 2;
	ped.t = 14;
}

// all pedestrians near x, z run away
function scarePeds(x, z, r) {
	for (var i = 0; i < city.peds.length; i++) {
		var ped = city.peds[i];
		var dx = ped.x - x, dz = ped.z - z;
		if (ped.state < 2 && dx * dx + dz * dz < r * r) {
			ped.state = 1;
			ped.t = 6 + city.rnd() * 3;
			ped.dir = (ped.axis === 0 ? dx : dz) >= 0 ? 1 : -1;
		}
	}
}

function updatePeds(dt, px, pz) {
	var dummy = city.dummy;
	dummy.scale.set(1.25, 1.25, 1.25);       // a little too large, so you see them from the air
	for (var i = 0; i < city.peds.length; i++) {
		var ped = city.peds[i];
		if (ped.state === 2) {
			ped.t -= dt;
			if (ped.t <= 0) {
				placePed(ped, px, pz);
			}
		} else {
			ped.pos += ped.dir * ped.speed * (ped.state === 1 ? 4.5 : 1) * dt;
			pedPlace(ped);
			if (ped.state === 1) {
				ped.t -= dt;
				if (ped.t <= 0) {
					ped.state = 0;
				}
			}
			var far = Math.abs(ped.x - px) > 350 || Math.abs(ped.z - pz) > 350;
			var out = ped.pos < CITY_MIN + 10 || ped.pos > CITY_MAX - 10 || inZone(ped.x, ped.z);
			if (out || (far && ped.state === 0)) {
				placePed(ped, px, pz);
			}
		}
		dummy.position.set(ped.x, ped.state === 2 ? 0.35 : 0.05, ped.z);
		dummy.rotation.set(ped.state === 2 ? Math.PI / 2 : 0, ped.yaw, 0, 'YXZ');
		dummy.updateMatrix();
		city.pedMesh.setMatrixAt(i, dummy.matrix);
	}
	city.pedMesh.instanceMatrix.needsUpdate = true;
	dummy.scale.set(1, 1, 1);
}

// ---------- air and sea ----------

function makeAirSea(group, rnd, material) {
	// the airliner that lands on the runway (the front points to -z)
	city.liner = new THREE.Mesh(boxesGeometry([
		[4, 4, 36, 0, 0, 0, 0xf2f2f2],
		[34, 0.6, 7, 0, -1.2, 1, 0xdadada],
		[0.6, 6, 5, 0, 5, 15.5, 0x2f7fd0],
		[12, 0.5, 4, 0, 1.5, 16, 0xdadada],
		[2, 2, 4, -7, -2.4, 0, 0x9a9a9a], [2, 2, 4, 7, -2.4, 0, 0x9a9a9a]
	]), material);
	group.add(city.liner);

	// the blimp above downtown (long along x)
	var body = new THREE.SphereGeometry(1, 14, 8);
	body.scale(34, 10, 10);
	city.blimp = new THREE.Group();
	city.blimp.add(new THREE.Mesh(body, new THREE.MeshLambertMaterial({ color: 0xd8d8de })));
	city.blimp.add(new THREE.Mesh(boxesGeometry([[8, 3, 3, 0, -10.5, 0, 0x3a3a40], [8, 9, 0.6, -30, 0, 0, 0xc03a3a], [8, 0.6, 9, -30, 0, 0, 0xc03a3a]]), material));
	group.add(city.blimp);

	// boats on the ocean (the front points to -z)
	var geo = boxesGeometry([[3.4, 1.6, 11, 0, 0.8, 0, 0xf4f4f4], [2.6, 1.6, 4, 0, 2.4, 1, 0xe0e0e0], [0.2, 10, 0.2, 0, 6.6, -1.5, 0xaaaaaa], [0.15, 8, 4.5, 0, 6.6, 1, 0xfafafa]]);
	city.boatMesh = new THREE.InstancedMesh(geo, material, 14);
	city.boatMesh.frustumCulled = false;
	for (var i = 0; i < 14; i++) {
		city.boats.push({ x: -1950 - rnd() * 900, z: -2600 + rnd() * 5200, dir: rnd() < 0.5 ? 1 : -1, speed: 3 + rnd() * 6 });
	}
	group.add(city.boatMesh);
}

function updateAirSea(dt) {
	var t = city.time;
	// the airliner: 48 s in the air, then it brakes on the runway, then it waits, then it is gone
	var phase = t % 110, z, y = 3.2;
	if (phase < 47.7) {
		z = 5200 - phase * 65;
		y = 3.2 + (z - 2100) * 0.075;
	} else {
		var u = Math.min(phase - 47.7, 25);
		z = 2100 - (65 * u - 1.3 * u * u);
	}
	city.liner.visible = phase < 95;
	city.liner.position.set(-1440, y, z);

	var a = t * 0.02;
	city.blimp.position.set(DOWNTOWN_X + Math.cos(a) * 560, 350, DOWNTOWN_Z + Math.sin(a) * 560);
	city.blimp.rotation.y = -a - Math.PI / 2;

	var dummy = city.dummy;
	for (var i = 0; i < city.boats.length; i++) {
		var boat = city.boats[i];
		boat.z += boat.dir * boat.speed * dt;
		if (boat.z > 3200 || boat.z < -3200) {
			boat.dir = -boat.dir;
		}
		dummy.position.set(boat.x, Math.sin(t * 1.3 + i) * 0.15, boat.z);
		dummy.rotation.set(0, boat.dir > 0 ? Math.PI : 0, 0);
		dummy.updateMatrix();
		city.boatMesh.setMatrixAt(i, dummy.matrix);
	}
	city.boatMesh.instanceMatrix.needsUpdate = true;
	city.wheel.rotation.z += 0.08 * dt;
}

// ---------- sky ----------

// the sun is low in the west, above the ocean
var SUN_DIR = new THREE.Vector3(-0.86, 0.3, 0.42).normalize();
var HAZE = 0xe9b58e;

function makeSky(scene) {
	var geo = new THREE.SphereGeometry(8000, 24, 14);
	var pos = geo.attributes.position;
	var col = [];
	var low = new THREE.Color(HAZE), mid = new THREE.Color(0xc9a9a8), high = new THREE.Color(0x4f7fb5);
	for (var i = 0; i < pos.count; i++) {
		var t = clamp(pos.getY(i) / 8000, 0, 1);
		if (t < 0.18) {
			tmpColor.copy(low).lerp(mid, t / 0.18);
		} else {
			tmpColor.copy(mid).lerp(high, Math.min(1, (t - 0.18) / 0.5));
		}
		col.push(tmpColor.r, tmpColor.g, tmpColor.b);
	}
	geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
	var sky = new THREE.Group();
	sky.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
	var sun = new THREE.Mesh(new THREE.CircleGeometry(330, 24), new THREE.MeshBasicMaterial({ color: 0xfff1c4, fog: false, depthWrite: false }));
	sun.position.copy(SUN_DIR).multiplyScalar(7500);
	sun.lookAt(0, 0, 0);
	sky.add(sun);
	sky.renderOrder = -1;
	scene.add(sky);

	scene.fog = new THREE.Fog(HAZE, 500, 5200);
	scene.add(new THREE.HemisphereLight(0xffe9d0, 0x5a554e, 1.5));
	var light = new THREE.DirectionalLight(0xffd9a8, 2.4);
	light.position.copy(SUN_DIR);
	scene.add(light);
	return sky;
}

// ---------- make ----------

// px, pz: where the player starts. The pedestrians start around this place.
function makeCity(scene, px, pz) {
	var rnd = makeRandom(1992);
	var group = new THREE.Group();
	city = {
		group: group, rnd: makeRandom(5), time: 0,
		lots: [], big: [], bufs: [], trees: [], palms: [],
		cars: [], carMesh: null, peds: [], pedMesh: null, boats: [], boatMesh: null,
		liner: null, blimp: null, wheel: null, sky: null, dummy: new THREE.Object3D()
	};
	var plain = new THREE.MeshLambertMaterial({ vertexColors: true });
	var mats = [
		new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture(rnd, 0) }),
		new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture(rnd, 1) }),
		new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture(rnd, 2) }),
		plain
	];
	makeBlocks(rnd);
	makePlaces(rnd);
	for (var key = 0; key < city.bufs.length; key++) {
		if (city.bufs[key]) {
			group.add(new THREE.Mesh(toGeometry(city.bufs[key]), mats[key % 4]));
		}
	}
	city.bufs = null;
	makeGround(group);
	city.wheel = makeCoast(group, rnd, plain);
	makeHills(group, rnd, plain);
	makeFreeways(group, plain);
	makeTrees(group, rnd);
	makeTraffic(group, rnd);
	makePeds(group, rnd, px, pz);
	makeAirSea(group, rnd, plain);
	city.sky = makeSky(scene);
	scene.add(group);
	return city;
}

// ---------- update ----------

// px, pz: where the player is
function updateCity(dt, px, pz) {
	city.time += dt;
	updateTraffic(dt);
	updatePeds(dt, px, pz);
	updateAirSea(dt);
}
