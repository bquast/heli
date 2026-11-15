// world.js - the city: streets, buildings, beach, hills, freeway, palms, traffic, sky.
// Classic script. It uses THREE from three.min.js.
//
// main.js calls makeCity() one time and updateTraffic() each frame.
// game.js uses roofAt(), clamp(), approach(), boxesGeometry(), makeRandom().
//
// The map (north is -z, west is -x):
//   a grid of 120 m cells. A road is on each cell line. A block of 100 m is in each cell.
//   west: the beach and the ocean.  north: the hills with the sign.
//   two raised freeways: one north-south, one east-west.
//
// Order of this file:
//   constants, helpers, box builder, textures, heights, buildings, ground, hills, freeway, palms, traffic, sky, make.

// ---------- constants ----------

var CELL = 120;          // m, one block and one road
var GRID = 36;           // cells in each direction
var HALF = 2160;         // m, half of the grid
var CITY_MIN = -1680;    // the city starts here (west and north edge)
var CITY_MAX = 2160;     // the city stops here (east and south edge)
var FWX = -1080;         // the north-south freeway is on this road line
var FWZ = 960;           // the east-west freeway is on this road line
var FW_Y = 12;           // m, height of the freeway deck
var FW_HALF = 13;        // m, half of the freeway width
var DOWNTOWN_X = 300;
var DOWNTOWN_Z = -120;
var MAX_ROOF = 320;      // m, nothing is higher than this

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

// ---------- box builder ----------

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

// a box. windows: true gives the walls the window texture. bottom: true adds the bottom face.
// uo, vo: where the window texture starts, so each building is different.
function addBox(buf, x0, x1, y0, y1, z0, z1, hex, windows, bottom, uo, vo) {
	tmpColor.setHex(hex);
	var r = tmpColor.r, g = tmpColor.g, b = tmpColor.b;
	var w = x1 - x0, h = y1 - y0, d = z1 - z0;
	// one unit of the texture is 8 windows: 32 m wide and 28 m high.
	// with no windows, all of the face uses one white point of the texture.
	var uw = windows ? w / 32 : 0, ud = windows ? d / 32 : 0, vh = windows ? h / 28 : 0;
	if (!windows) {
		uo = 0.004;
		vo = 0.004;
	}
	addQuad(buf, x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, 1, 0, 0, r, g, b, uo, vo, uo + ud, vo + vh);
	addQuad(buf, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, -1, 0, 0, r, g, b, uo, vo, uo + ud, vo + vh);
	addQuad(buf, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1, r, g, b, uo, vo, uo + uw, vo + vh);
	addQuad(buf, x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1, r, g, b, uo, vo, uo + uw, vo + vh);
	// the roof is darker
	var k = windows ? 0.5 : 0.9;
	addQuad(buf, x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, 0, 1, 0, r * k, g * k, b * k, 0.004, 0.004, 0.004, 0.004);
	if (bottom) {
		addQuad(buf, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, 0, -1, 0, r * 0.6, g * 0.6, b * 0.6, 0.004, 0.004, 0.004, 0.004);
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
function windowTexture(rnd) {
	var canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 256;
	var c = canvas.getContext('2d');
	c.fillStyle = '#ffffff';
	c.fillRect(0, 0, 256, 256);
	for (var i = 0; i < 8; i++) {
		for (var j = 0; j < 8; j++) {
			var v = rnd();
			c.fillStyle = v < 0.12 ? '#ffd98a' : (v < 0.5 ? '#3d4c63' : '#55667e');
			c.fillRect(i * 32 + 7, j * 32 + 8, 19, 17);
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
	c.fillStyle = '#9a958c';                // sidewalk
	c.fillRect(21, 21, 214, 214);
	c.fillStyle = '#6d695f';                // the ground of the block
	c.fillRect(28, 28, 200, 200);
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
function roofAt(x, z) {
	if (z < CITY_MIN) {
		return hillAt(x, z);
	}
	if (x < CITY_MIN || x >= CITY_MAX || z >= CITY_MAX) {
		return 0;
	}
	var h = 0;
	if (Math.abs(x - FWX) < FW_HALF || Math.abs(z - FWZ) < FW_HALF) {
		h = FW_Y + 0.6;
	}
	var i = Math.floor((x + HALF) / CELL);
	var j = Math.floor((z + HALF) / CELL);
	var lots = city.lots[i * GRID + j];
	for (var k = 0; k < lots.length; k++) {
		var b = lots[k];
		if (x >= b[0] && x <= b[1] && z >= b[2] && z <= b[3]) {
			return Math.max(h, b[4]);
		}
	}
	return h;
}

// ---------- buildings ----------

var GLASS = [0x7f98ad, 0x8aa0a8, 0x9aa7b5, 0x6f8494, 0xb0a79a, 0x5f7388, 0xa9b4bd];
var STUCCO = [0xe8dcc4, 0xe2b79a, 0xd9c7a3, 0xf0ead8, 0xc9a58a, 0xbcd0c8, 0xe6c7b0, 0xd0d0c8];

// fill city.lots and make the mesh of all buildings. It also gives the places of the park palms.
function makeBuildings(rnd, material, palms) {
	var buf = newBuffer();
	for (var i = 0; i < GRID; i++) {
		for (var j = 0; j < GRID; j++) {
			var lots = [];
			city.lots[i * GRID + j] = lots;
			var x0 = -HALF + i * CELL, z0 = -HALF + j * CELL;
			if (x0 < CITY_MIN || z0 < CITY_MIN) {
				continue;                    // beach, ocean or hills
			}
			// the block is smaller next to a freeway
			var bx0 = x0 + (x0 === FWX ? 17 : 11), bx1 = x0 + CELL - (x0 + CELL === FWX ? 17 : 11);
			var bz0 = z0 + (z0 === FWZ ? 17 : 11), bz1 = z0 + CELL - (z0 + CELL === FWZ ? 17 : 11);
			var cx = x0 + CELL / 2, cz = z0 + CELL / 2;
			var d = Math.sqrt((cx - DOWNTOWN_X) * (cx - DOWNTOWN_X) + (cz - DOWNTOWN_Z) * (cz - DOWNTOWN_Z));
			var d2 = Math.sqrt((cx + 900) * (cx + 900) + (cz - 360) * (cz - 360));   // a second group of towers in the west

			// what is in this block
			var n = 3, hMin = 5, hMax = 14, colors = STUCCO, tower = false;
			if (d < 380) {
				n = rnd() < 0.5 ? 1 : 2;
				hMin = 70;
				hMax = 90 + 200 * (1 - d / 500);
				colors = GLASS;
				tower = true;
			} else if (d2 < 260) {
				n = 2;
				hMin = 50;
				hMax = 140;
				colors = GLASS;
				tower = true;
			} else if (d < 800) {
				n = 2;
				hMin = 18;
				hMax = 70 - d * 0.03;
				colors = rnd() < 0.5 ? GLASS : STUCCO;
			} else if (cx < -1300) {
				n = 2;                       // hotels along the beach
				hMin = 12;
				hMax = 34;
			} else if (rnd() < 0.1) {
				// a park
				addBox(buf, bx0, bx1, 0, 1, bz0, bz1, 0x4f7a3a, false, false, 0, 0);
				lots.push([bx0, bx1, bz0, bz1, 1]);
				for (var q = 0; q < 7; q++) {
					palms.push(bx0 + 8 + rnd() * (bx1 - bx0 - 16), 1, bz0 + 8 + rnd() * (bz1 - bz0 - 16));
				}
				continue;
			}

			var sx = (bx1 - bx0) / n, sz = (bz1 - bz0) / n;
			for (var a = 0; a < n; a++) {
				for (var b = 0; b < n; b++) {
					if (n === 3 && rnd() < 0.08) {
						continue;            // an empty lot
					}
					var inset = n === 3 ? 1.5 + rnd() * 2.5 : 2 + rnd() * 4;
					var lx0 = bx0 + a * sx + inset, lx1 = bx0 + (a + 1) * sx - inset;
					var lz0 = bz0 + b * sz + inset, lz1 = bz0 + (b + 1) * sz - inset;
					var h = hMin + rnd() * (hMax - hMin);
					var color = colors[Math.floor(rnd() * colors.length)];
					var uo = Math.floor(rnd() * 8) / 8, vo = Math.floor(rnd() * 8) / 8;
					addBox(buf, lx0, lx1, 0, h, lz0, lz1, color, true, false, uo, vo);
					var top = h;
					if (tower) {
						// a smaller box on the roof
						var m = (lx1 - lx0) * 0.25, e = 6 + rnd() * 18;
						addBox(buf, lx0 + m, lx1 - m, h, h + e, lz0 + m, lz1 - m, color, rnd() < 0.5, false, uo, vo);
						top = h + e;
					}
					lots.push([lx0, lx1, lz0, lz1, top]);
				}
			}
		}
	}
	return new THREE.Mesh(toGeometry(buf), material);
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

// the pier with the big wheel
function makePier(group, material) {
	var list = [[350, 1, 26, -1875, 5.5, 193, 0x8a6f4d]];
	for (var x = -2040; x <= -1720; x += 40) {
		list.push([2, 5, 2, x, 2.5, 182, 0x5a4a38]);
		list.push([2, 5, 2, x, 2.5, 204, 0x5a4a38]);
	}
	list.push([2, 36, 2, -1990, 24, 186, 0xd8d8d8]);
	list.push([2, 36, 2, -1990, 24, 200, 0xd8d8d8]);
	group.add(new THREE.Mesh(boxesGeometry(list), material));
	var wheel = new THREE.Group();
	wheel.add(new THREE.Mesh(new THREE.TorusGeometry(28, 0.8, 6, 28), new THREE.MeshLambertMaterial({ color: 0xe05a4a })));
	wheel.add(new THREE.Mesh(boxesGeometry([[56, 0.5, 0.5, 0, 0, 0, 0xf0f0f0], [0.5, 56, 0.5, 0, 0, 0, 0xf0f0f0]]), material));
	wheel.position.set(-1990, 40, 193);
	wheel.rotation.y = Math.PI / 2;
	group.add(wheel);
	return wheel;
}

// ---------- hills ----------

function makeHills(group) {
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

	// the sign
	var sign = new THREE.Mesh(new THREE.PlaneGeometry(300, 38), new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true, alphaTest: 0.5 }));
	sign.position.set(DOWNTOWN_X, hillAt(DOWNTOWN_X, -2250) + 26, -2250);
	group.add(sign);
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
	}
	group.add(new THREE.Mesh(boxesGeometry(list), material));
}

// ---------- palms ----------

// palms: a flat list of x, y, z
function makePalms(group, rnd, palms) {
	// along each sixth east-west street, on the two sidewalks
	for (var j = 5; j < GRID; j += 6) {
		var z = -HALF + j * CELL;
		for (var x = CITY_MIN + 6; x < CITY_MAX; x += 24) {
			var m = ((x + HALF) % CELL + CELL) % CELL;
			if (m < 14 || m > CELL - 14) {
				continue;                    // a crossing
			}
			palms.push(x, 0, z - 12.5);
			palms.push(x + 12, 0, z + 12.5);
		}
	}
	// along the beach
	for (var bz = CITY_MIN + 10; bz < CITY_MAX; bz += 22) {
		palms.push(-1696 - rnd() * 8, 0, bz);
	}
	var count = palms.length / 3;
	var trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 13, 5);
	trunkGeo.translate(0, 6.5, 0);
	var crownGeo = new THREE.SphereGeometry(4.2, 7, 3);
	crownGeo.scale(1, 0.4, 1);
	crownGeo.translate(0, 13.6, 0);
	var trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a644a }), count);
	var crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x3f7a35 }), count);
	var dummy = new THREE.Object3D();
	for (var i = 0; i < count; i++) {
		var s = 0.8 + rnd() * 0.5;
		dummy.position.set(palms[i * 3], palms[i * 3 + 1], palms[i * 3 + 2]);
		dummy.scale.set(1, s, 1);
		dummy.updateMatrix();
		trunks.setMatrixAt(i, dummy.matrix);
		crowns.setMatrixAt(i, dummy.matrix);
	}
	group.add(trunks);
	group.add(crowns);
}

// ---------- traffic ----------

// A car is on a road line.
//   axis 0: it moves along x, on the road at z = line.   axis 1: it moves along z, on the road at x = line.
//   dir: +1 or -1.   lane: m from the center of the road, to the right.   y: 0, or the freeway deck.
// game.js uses the same record for the enemy vans.
function newRoadCar(rnd, freeway) {
	var car = { axis: rnd() < 0.5 ? 0 : 1, line: 0, pos: 0, dir: rnd() < 0.5 ? 1 : -1, lane: 3.5, speed: 9 + rnd() * 6, x: 0, y: 0.05, z: 0, yaw: 0 };
	if (freeway) {
		car.line = car.axis === 0 ? FWZ : FWX;
		car.lane = rnd() < 0.5 ? 3.5 : 8.5;
		car.speed = 24 + rnd() * 8;
		car.y = FW_Y + 0.05;
	} else {
		car.line = CITY_MIN + CELL * (1 + Math.floor(rnd() * 31));
	}
	car.pos = CITY_MIN + rnd() * (CITY_MAX - CITY_MIN);
	return car;
}

// move the car and set its x, z and yaw
function moveRoadCar(car, dt) {
	car.pos += car.dir * car.speed * dt;
	if (car.pos > CITY_MAX) {
		car.pos = CITY_MIN;
	}
	if (car.pos < CITY_MIN) {
		car.pos = CITY_MAX;
	}
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

var CAR_COLORS = [0xf2f2f2, 0xd0d0d0, 0x2a2a2e, 0x1f3f6f, 0x8a8a8a, 0xc9b25a, 0x6a8a9a, 0xa33a2a, 0x3a3a3a, 0xe8e0c8];

function makeTraffic(group, rnd) {
	var geo = boxesGeometry([[2, 0.8, 4.6, 0, 0.6, 0, 0xffffff], [1.8, 0.6, 2.4, 0, 1.3, 0.2, 0x30343a]]);
	var count = 300;
	var mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), count);
	mesh.frustumCulled = false;
	city.cars = [];
	for (var i = 0; i < count; i++) {
		city.cars.push(newRoadCar(rnd, i < 70));
		tmpColor.setHex(CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]);
		mesh.setColorAt(i, tmpColor);
	}
	city.carMesh = mesh;
	city.dummy = new THREE.Object3D();
	group.add(mesh);
}

function updateTraffic(dt) {
	var dummy = city.dummy;
	for (var i = 0; i < city.cars.length; i++) {
		var car = city.cars[i];
		moveRoadCar(car, dt);
		dummy.position.set(car.x, car.y, car.z);
		dummy.rotation.y = car.yaw;
		dummy.updateMatrix();
		city.carMesh.setMatrixAt(i, dummy.matrix);
	}
	city.carMesh.instanceMatrix.needsUpdate = true;
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

function makeCity(scene) {
	var rnd = makeRandom(1992);
	var group = new THREE.Group();
	city = { group: group, lots: [], cars: [], carMesh: null, dummy: null, wheel: null, sky: null };
	var plain = new THREE.MeshLambertMaterial({ vertexColors: true });
	var walls = new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture(rnd) });
	var palms = [];
	group.add(makeBuildings(rnd, walls, palms));
	makeGround(group);
	city.wheel = makePier(group, plain);
	makeHills(group);
	makeFreeways(group, plain);
	makePalms(group, rnd, palms);
	makeTraffic(group, rnd);
	city.sky = makeSky(scene);
	scene.add(group);
	return city;
}
