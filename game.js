// game.js - the helicopter, the weapons, the enemies, the panel and the sound.
// Classic script. It uses roofAt(), inZone(), clamp(), approach(), boxesGeometry(), makeRandom(), newRoadCar(), moveRoadCar(),
// wreckCar(), dropPed(), scarePeds() and the lists city.cars and city.peds from world.js.
//
// main.js calls makeGame() one time and updateGame() each frame.
//
// Comfort rules of the flight (change the numbers in HELI to tune them):
//   the cockpit stays level, it does not tilt.
//   speed, turn and climb change slowly, there are no sudden moves and no snap turns.
//   the cockpit frame is always in view, as a fixed reference for the eyes.
//   there is no fall and no crash: the helicopter stays above the roofs by itself.
//
// Aim: by default you point with the right controller. The other mode is aim with the head.
//
// The city reacts as in GTA: you can shoot the cars and the pedestrians. Each crime adds to the wanted level
// (1 to 5 stars). The police then come with cars and helicopters. With no new crime the stars go away.
//
// Order of this file:
//   constants, models, make, flight, aim, gun, rockets, civilians, enemies, police, shells, effects, waves, panel, sound, update.

// ---------- constants ----------

// speed in m/s, accel in m/s2, turn in radians/s. clear: m that the helicopter stays above a roof.
var HELI = { speed: 30, reverse: 10, accel: 6, brake: 14, climb: 8, climbAccel: 8, turn: 0.55, turnAccel: 1.2, clear: 14, ceiling: 500 };
var GUN = { rate: 0.09, damage: 10, range: 1200 };
var ROCKET = { rate: 0.8, speed: 170, damage: 120, radius: 22, life: 7 };
var SHELL = { speed: 110, damage: 7, life: 7, max: 96 };
var START = { x: 300, y: 160, z: 1300, yaw: 0 };     // south of downtown, the nose to the north
var EYE = { x: 0, y: 1.5, z: -0.3 };                 // the desktop camera in the cockpit

// hp, r: radius for hits. range: it fires when the player is nearer. wait: s between shots. score: points.
var VAN = { kind: 'van', hp: 40, r: 7, range: 420, wait: 2.4, score: 100, up: 3 };
var TURRET = { kind: 'turret', hp: 60, r: 6, range: 520, wait: 1.7, score: 150, up: 2.5 };
var GUNSHIP = { kind: 'gunship', hp: 90, r: 8, range: 480, wait: 2.8, score: 300, up: 0 };
var COP_CAR = { kind: 'copcar', hp: 50, r: 6, range: 380, wait: 2.0, score: 50, up: 2 };
var COP_HELI = { kind: 'copheli', hp: 80, r: 8, range: 460, wait: 3.0, score: 100, up: 0 };
// the wanted level: what each crime adds, and how fast it goes away
var CRIME = { car: 0.6, ped: 0.4, cop: 0.8, calm: 15, fade: 25 };

// ---------- models (the front points to -z) ----------

// the cockpit is open: only a frame. There is no floor and no console, so you can aim down.
function cockpitGeometry() {
	var dark = 0x2b2f33, frame = 0x3a4046, body = 0x4a5a3c;
	return boxesGeometry([
		[1.97, 0.07, 0.07, 0, 2.1, -1.5, frame], [1.97, 0.07, 0.07, 0, 2.1, 1.0, frame],     // roof bars
		[0.07, 0.07, 2.5, -0.95, 2.1, -0.25, frame], [0.07, 0.07, 2.5, 0.95, 2.1, -0.25, frame],
		[1.9, 0.05, 1.3, 0, 2.14, 0.35, body],                                               // roof plate
		[1.9, 2.1, 0.08, 0, 1.05, 1.04, body],                                               // rear wall
		[0.07, 0.07, 2.5, -0.95, 0, -0.25, frame], [0.07, 0.07, 2.5, 0.95, 0, -0.25, frame], // floor bars
		[0.4, 0.4, 5, 0, 1.5, 3.5, body], [0.1, 1.3, 0.7, 0, 2.1, 5.8, body],                // tail
		[0.1, 0.1, 3.2, -1.1, -0.6, -0.2, dark], [0.1, 0.1, 3.2, 1.1, -0.6, -0.2, dark],     // skids
		[0.22, 0.22, 1.4, 0.6, -0.3, -1.3, dark],                                            // gun
		[1.1, 0.08, 0.5, -1.5, 0.3, 0, body], [1.1, 0.08, 0.5, 1.5, 0.3, 0, body],           // small wings
		[0.4, 0.4, 1.5, -1.9, 0.05, -0.1, dark], [0.4, 0.4, 1.5, 1.9, 0.05, -0.1, dark]      // rocket pods
	]);
}

function vanGeometry() {
	var red = 0x9c1f1f, dark = 0x26282a;
	return boxesGeometry([
		[2.2, 1.6, 5.2, 0, 1.3, 0, red],
		[2.1, 0.7, 1.6, 0, 2.3, -1.3, dark],
		[1.1, 0.6, 1.1, 0, 2.4, 0.8, dark],
		[0.2, 0.2, 2, 0, 2.6, -0.4, 0x111111],
		[2.4, 0.8, 1, 0, 0.4, -1.6, dark], [2.4, 0.8, 1, 0, 0.4, 1.6, dark]
	]);
}

function turretBaseGeometry() {
	return boxesGeometry([[3.2, 1, 3.2, 0, 0.5, 0, 0x4a5058], [3.3, 0.25, 3.3, 0, 0.75, 0, 0xb02020]]);
}

function turretGunGeometry() {
	return boxesGeometry([
		[1.6, 1.2, 1.8, 0, 0, 0, 0x3a3f45],
		[0.25, 0.25, 3.6, -0.4, 0.1, 2.2, 0x1a1a1a], [0.25, 0.25, 3.6, 0.4, 0.1, 2.2, 0x1a1a1a]   // to +z: lookAt() points +z to the player
	]);
}

function copCarGeometry() {
	var black = 0x18181c, white = 0xf2f2f2;
	return boxesGeometry([
		[2.1, 0.9, 5, 0, 0.75, 0, black],
		[2.12, 0.92, 1.8, 0, 0.75, 0, white],
		[1.9, 0.7, 2.6, 0, 1.5, 0.2, white],
		[1.2, 0.12, 0.3, 0, 1.92, 0.2, 0x333333]
	]);
}

function gunshipGeometry(hull, red) {
	return boxesGeometry([
		[2, 2, 6, 0, 0, 0, hull],
		[1.4, 1.2, 2, 0, -0.3, -3.8, hull],
		[1.2, 0.8, 1.8, 0, 1.1, -1.6, 0x7fb0d0],
		[2.05, 0.6, 1, 0, 0, 1.6, red],
		[0.5, 0.5, 6, 0, 0.5, 5.6, hull], [0.15, 2.2, 1, 0, 1.6, 8.2, red],
		[6, 0.15, 1, 0, -0.4, 0, hull]
	]);
}

function rotorGeometry(r) {
	return boxesGeometry([[r * 2, 0.06, r * 0.07, 0, 0, 0, 0x1c1c1c], [r * 0.07, 0.06, r * 2, 0, 0, 0, 0x1c1c1c]]);
}

// the mark above each enemy. The material gives the color: red for the gangs, blue for the police.
function markerTexture() {
	var canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	var c = canvas.getContext('2d');
	c.strokeStyle = '#ffffff';
	c.lineWidth = 7;
	c.beginPath();
	c.moveTo(32, 6);
	c.lineTo(58, 32);
	c.lineTo(32, 58);
	c.lineTo(6, 32);
	c.closePath();
	c.stroke();
	return new THREE.CanvasTexture(canvas);
}

// ---------- make ----------

function makeGame(scene, camera, renderer) {
	var game = {
		scene: scene, camera: camera,
		rnd: makeRandom(7),
		mat: new THREE.MeshLambertMaterial({ vertexColors: true }),
		player: { group: new THREE.Group(), x: START.x, y: START.y, z: START.z, yaw: START.yaw, speed: 0, climb: 0, turn: 0, hp: 100, hurtT: 0, deadT: 0, gunT: 0, rocketT: 0, pod: 1, rotor: null },
		aim: { point: new THREE.Vector3(), enemy: null, t: 0 },
		aimHead: false,       // false: aim with the right controller. true: aim with the head.
		hands: [], reticle: null, shade: null,
		heat: 0, crimeT: 0, copT: 0, smokeT: 0,      // the wanted level is heat, 0 to 5
		enemies: [], rockets: [], tracers: [], booms: [], shells: [], shellMesh: null,
		geo: { van: vanGeometry(), base: turretBaseGeometry(), gun: turretGunGeometry(), ship: gunshipGeometry(0x30343a, 0xb02020), copCar: copCarGeometry(), copHeli: gunshipGeometry(0xf0f0f0, 0x2a4a9a), rotor: rotorGeometry(6.5), rocket: boxesGeometry([[0.25, 0.25, 1.6, 0, 0, 0, 0xe8e8e8]]) },
		markerMat: null, copMarkerMat: null,
		started: false, score: 0, wave: 0, waveT: 3, message: 'GET READY', messageT: 3,
		panel: null, panelT: 0, audio: null, time: 0
	};
	var p = game.player;
	var markTex = markerTexture();
	game.markerMat = new THREE.SpriteMaterial({ map: markTex, color: 0xff3a2a, depthTest: false, sizeAttenuation: false, fog: false });
	game.copMarkerMat = new THREE.SpriteMaterial({ map: markTex, color: 0x4aa0ff, depthTest: false, sizeAttenuation: false, fog: false });

	// the controllers. Each has a small block. The right one also has a beam that shows the aim.
	var gripGeo = new THREE.BoxGeometry(0.045, 0.045, 0.13);
	var beamGeo = new THREE.BoxGeometry(0.004, 0.004, 1.6);
	beamGeo.translate(0, 0, -0.9);
	for (var h = 0; h < 2; h++) {
		var hand = renderer.xr.getController(h);
		hand.userData.side = '';
		hand.userData.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x7dff7d, transparent: true, opacity: 0.55, fog: false }));
		hand.userData.beam.visible = false;
		hand.add(new THREE.Mesh(gripGeo, game.mat));
		hand.add(hand.userData.beam);
		hand.visible = false;
		hand.addEventListener('connected', function (e) {
			this.userData.side = e.data.handedness;
			this.visible = true;
		});
		hand.addEventListener('disconnected', function () {
			this.userData.side = '';
			this.visible = false;
		});
		p.group.add(hand);
		game.hands.push(hand);
	}

	// the cockpit
	p.group.add(new THREE.Mesh(cockpitGeometry(), game.mat));
	p.rotor = new THREE.Group();
	p.rotor.add(new THREE.Mesh(rotorGeometry(4.6), game.mat));
	p.rotor.position.set(0, 2.7, 0);
	p.group.add(p.rotor);
	p.group.add(camera);
	camera.position.set(EYE.x, EYE.y, EYE.z);
	scene.add(p.group);

	// the panel is below the front roof bar, above the main view
	var canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 256;
	var tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	var screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
	screen.position.set(0, 1.9, -1.44);
	screen.rotation.x = 0.35;
	p.group.add(screen);
	game.panel = { canvas: canvas, c: canvas.getContext('2d'), tex: tex };

	// the aim ring. It is on the thing that you aim at.
	game.reticle = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 28), new THREE.MeshBasicMaterial({ color: 0x7dff7d, depthTest: false, fog: false, transparent: true, opacity: 0.9 }));
	game.reticle.renderOrder = 998;
	scene.add(game.reticle);

	// a dark ball around the head: red for a hit, black when the helicopter is down
	game.shade = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, fog: false }));
	game.shade.renderOrder = 999;
	game.shade.visible = false;
	camera.add(game.shade);

	// pools
	var tracerGeo = new THREE.BoxGeometry(0.12, 0.12, 1);
	var tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, fog: false });
	for (var i = 0; i < 8; i++) {
		var tracer = { mesh: new THREE.Mesh(tracerGeo, tracerMat), t: 0 };
		tracer.mesh.visible = false;
		scene.add(tracer.mesh);
		game.tracers.push(tracer);
	}
	var boomGeo = new THREE.SphereGeometry(1, 10, 7);
	for (var b = 0; b < 40; b++) {
		var boom = { mesh: new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, depthWrite: false })), t: 0, dur: 1, size: 1 };
		boom.mesh.visible = false;
		scene.add(boom.mesh);
		game.booms.push(boom);
	}
	game.shellMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff6a2a, fog: false }), SHELL.max);
	game.shellMesh.frustumCulled = false;
	game.shellMesh.count = 0;
	scene.add(game.shellMesh);

	placePlayer(game);
	drawPanel(game);
	return game;
}

function placePlayer(game) {
	var p = game.player;
	p.group.position.set(p.x, p.y, p.z);
	p.group.rotation.y = p.yaw;
	city.sky.position.set(p.x, 0, p.z);
}

// ---------- flight ----------

// the highest roof on the path, d m in front: in the middle and 4 m to each side
function pathRoof(x, z, fx, fz, d) {
	var cx = x + fx * d, cz = z + fz * d;
	return Math.max(roofAt(cx, cz), roofAt(cx - fz * 4, cz + fx * 4), roofAt(cx + fz * 4, cz - fx * 4));
}

// input: move (-1..1, forward is +), turn (-1..1, right is +), climb (-1..1, up is +)
function flyPlayer(game, input, dt) {
	var p = game.player;
	var fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);

	// turn, slowly
	p.turn = approach(p.turn, -input.turn * HELI.turn, HELI.turnAccel * dt);
	p.yaw += p.turn * dt;

	// the roofs here and on the path
	var want = input.move > 0 ? input.move * HELI.speed : input.move * HELI.reverse;
	var dir = (Math.abs(p.speed) > 0.5 ? p.speed : want) < 0 ? -1 : 1;
	var here = Math.max(roofAt(p.x, p.z), roofAt(p.x + 3, p.z), roofAt(p.x - 3, p.z), roofAt(p.x, p.z + 3), roofAt(p.x, p.z - 3));
	var v = Math.abs(p.speed);
	var near = pathRoof(p.x, p.z, fx, fz, dir * 9);
	var r1 = pathRoof(p.x, p.z, fx, fz, dir * (9 + v));
	var r2 = pathRoof(p.x, p.z, fx, fz, dir * (9 + v * 2));

	// a wall in front: go slower, then stop. The helicopter then climbs above it.
	var limit = HELI.speed;
	if (r2 > p.y - 2) {
		limit = 16;
	}
	if (r1 > p.y - 2) {
		limit = 7;
	}
	if (near > p.y - 2) {
		limit = 0;
	}
	want = clamp(want, -limit, limit);
	var slower = Math.abs(want) < Math.abs(p.speed) || want * p.speed < 0;
	p.speed = approach(p.speed, want, (slower ? (limit < HELI.speed ? HELI.brake : HELI.accel) : HELI.accel) * dt);
	if (limit === 0 && Math.abs(p.speed) < 3) {
		p.speed = 0;
	}
	var nx = p.x + fx * p.speed * dt, nz = p.z + fz * p.speed * dt;
	if (pathRoof(nx, nz, fx, fz, dir * 5) > p.y - 1) {
		p.speed = 0;                         // never go into a wall
	} else {
		p.x = clamp(nx, -3400, 3400);
		p.z = clamp(nz, -3300, 3400);
	}

	// climb. Below the safe height the helicopter climbs by itself.
	var floor = Math.max(here, near, r1, r2) + HELI.clear;
	var climb = input.climb * HELI.climb;
	if (p.y < floor) {
		climb = Math.max(climb, Math.min(HELI.climb * 1.5, (floor - p.y) * 1.2));
	}
	if (p.y > HELI.ceiling) {
		climb = Math.min(climb, 0);
	}
	p.climb = approach(p.climb, climb, HELI.climbAccel * dt);
	p.y += p.climb * dt;
	if (p.y < here + 3) {
		p.y = here + 3;
		p.climb = Math.max(p.climb, 0);
	}
	placePlayer(game);
	p.rotor.rotation.y += 9 * dt;
}

// ---------- aim ----------

// the distance along a ray to the first roof, hill or street. max when there is none.
function rayCity(ox, oy, oz, dx, dy, dz, max) {
	var t = 4;
	if (oy > MAX_ROOF) {
		if (dy >= 0) {
			return max;
		}
		t = Math.max(t, (oy - MAX_ROOF) / -dy);
	}
	for (; t < max; t += 4) {
		var y = oy + dy * t;
		if (y <= 0) {
			return dy < 0 ? oy / -dy : t;
		}
		if (y > MAX_ROOF && dy >= 0) {
			return max;
		}
		if (roofAt(ox + dx * t, oz + dz * t) > y) {
			return t;
		}
	}
	return max;
}

var aimFrom = new THREE.Vector3(), aimDir = new THREE.Vector3(), eyePos = new THREE.Vector3();

// the right controller, or null when there is none (on the desktop, or before it connects)
function aimHand(game) {
	for (var h = 0; h < game.hands.length; h++) {
		if (game.hands[h].userData.side === 'right') {
			return game.hands[h];
		}
	}
	return null;
}

// find the point that the player aims at: with the right controller, or with the head.
// An enemy near the aim line gets the aim.
function findAim(game) {
	var aim = game.aim;
	var hand = game.aimHead ? null : aimHand(game);
	for (var h = 0; h < game.hands.length; h++) {
		game.hands[h].userData.beam.visible = game.hands[h] === hand;
	}
	if (hand) {
		hand.getWorldPosition(aimFrom);
		aimDir.set(0, 0, -1).transformDirection(hand.matrixWorld);
	} else {
		game.camera.getWorldPosition(aimFrom);
		game.camera.getWorldDirection(aimDir);
	}
	var best = rayCity(aimFrom.x, aimFrom.y, aimFrom.z, aimDir.x, aimDir.y, aimDir.z, GUN.range);
	aim.enemy = null;
	for (var i = 0; i < game.enemies.length; i++) {
		var e = game.enemies[i];
		var ex = e.x - aimFrom.x, ey = e.y + e.stats.up - aimFrom.y, ez = e.z - aimFrom.z;
		var along = ex * aimDir.x + ey * aimDir.y + ez * aimDir.z;
		if (along < 5 || along > best + e.stats.r) {
			continue;
		}
		var off2 = ex * ex + ey * ey + ez * ez - along * along;
		// far enemies get more help
		var r = e.stats.r + along * 0.012;
		if (off2 < r * r) {
			best = along;
			aim.enemy = e;
		}
	}
	aim.t = best;
	if (aim.enemy) {
		aim.point.set(aim.enemy.x, aim.enemy.y + aim.enemy.stats.up, aim.enemy.z);
	} else {
		aim.point.copy(aimDir).multiplyScalar(best).add(aimFrom);
	}
	// the ring is at the distance of the thing, so the two eyes see it on the thing. It faces the eyes.
	var d = clamp(best, 15, 400);
	game.reticle.position.copy(aimDir).multiplyScalar(d).add(aimFrom);
	game.camera.getWorldPosition(eyePos);
	game.camera.getWorldQuaternion(game.reticle.quaternion);
	game.reticle.scale.setScalar(eyePos.distanceTo(game.reticle.position) / 40);
	game.reticle.material.color.setHex(aim.enemy ? 0xff5040 : 0x7dff7d);
}

// ---------- gun ----------

var muzzle = new THREE.Vector3(), tmpV = new THREE.Vector3();

function fireGun(game) {
	var p = game.player, aim = game.aim;
	p.gunT = GUN.rate;
	muzzle.set(0.6, -0.3, -2.1).applyMatrix4(p.group.matrixWorld);
	tmpV.copy(aim.point);
	// with no enemy in the aim, a car or a pedestrian on the aim line gets the hit
	var civ = aim.enemy ? null : findCivilian(game);
	if (civ) {
		tmpV.set(civ.x, civ.car ? civ.car.y + 1 : 1.1, civ.z);
	} else if (!aim.enemy) {
		tmpV.x += (game.rnd() - 0.5) * aim.t * 0.012;
		tmpV.y += (game.rnd() - 0.5) * aim.t * 0.012;
		tmpV.z += (game.rnd() - 0.5) * aim.t * 0.012;
	}
	addTracer(game, muzzle, tmpV);
	if (aim.t < GUN.range || civ) {
		addBoom(game, tmpV.x, tmpV.y, tmpV.z, aim.enemy || civ ? 2.5 : 1.6, aim.enemy || civ ? 0xffc040 : 0xb8b0a0, 0.25);
		scarePeds(tmpV.x, tmpV.z, 45);
	}
	if (aim.enemy) {
		hurtEnemy(game, aim.enemy, GUN.damage);
	} else if (civ && civ.car) {
		hurtCar(game, civ.car, GUN.damage);
	} else if (civ) {
		hurtPed(game, civ.ped);
	}
	playNoise(game, 0.07, 1800, 0.16);
}

function addTracer(game, from, to) {
	for (var i = 0; i < game.tracers.length; i++) {
		var tr = game.tracers[i];
		if (tr.t <= 0) {
			tr.t = 0.05;
			tr.mesh.position.copy(from).add(to).multiplyScalar(0.5);
			tr.mesh.lookAt(to);
			tr.mesh.scale.set(1, 1, from.distanceTo(to));
			tr.mesh.visible = true;
			return;
		}
	}
}

// ---------- rockets ----------

function fireRocket(game) {
	var p = game.player;
	p.rocketT = ROCKET.rate;
	p.pod = -p.pod;
	var mesh = new THREE.Mesh(game.geo.rocket, game.mat);
	mesh.position.set(1.9 * p.pod, 0.05, -1.2).applyMatrix4(p.group.matrixWorld);
	mesh.lookAt(game.aim.point);
	game.scene.add(mesh);
	tmpV.copy(game.aim.point).sub(mesh.position).normalize();
	game.rockets.push({ mesh: mesh, vx: tmpV.x * ROCKET.speed, vy: tmpV.y * ROCKET.speed, vz: tmpV.z * ROCKET.speed, life: ROCKET.life, smoke: 0 });
	playNoise(game, 0.5, 900, 0.3);
}

function updateRockets(game, dt) {
	for (var i = game.rockets.length - 1; i >= 0; i--) {
		var r = game.rockets[i], m = r.mesh.position;
		m.x += r.vx * dt;
		m.y += r.vy * dt;
		m.z += r.vz * dt;
		r.life -= dt;
		r.smoke -= dt;
		if (r.smoke <= 0) {
			r.smoke = 0.05;
			addBoom(game, m.x, m.y, m.z, 1.1, 0xd8d8d8, 0.4);
		}
		var hit = r.life <= 0 || m.y <= 0.5 || roofAt(m.x, m.z) > m.y;
		for (var k = 0; k < game.enemies.length && !hit; k++) {
			var e = game.enemies[k];
			var dx = e.x - m.x, dy = e.y + e.stats.up - m.y, dz = e.z - m.z;
			hit = dx * dx + dy * dy + dz * dz < (e.stats.r + 2) * (e.stats.r + 2);
		}
		if (hit) {
			explode(game, m.x, m.y, m.z);
			game.scene.remove(r.mesh);
			game.rockets.splice(i, 1);
		}
	}
}

function explode(game, x, y, z) {
	addBoom(game, x, y, z, ROCKET.radius * 0.6, 0xffa040, 0.6);
	addBoom(game, x, y + 3, z, ROCKET.radius * 0.4, 0x504840, 1.2);
	playNoise(game, 1.1, 320, 0.5);
	for (var k = game.enemies.length - 1; k >= 0; k--) {
		var e = game.enemies[k];
		var dx = e.x - x, dy = e.y + e.stats.up - y, dz = e.z - z;
		var d = Math.sqrt(dx * dx + dy * dy + dz * dz) - e.stats.r;
		if (d < ROCKET.radius) {
			hurtEnemy(game, e, ROCKET.damage * (1 - Math.max(0, d) / ROCKET.radius));
		}
	}
	if (y < 40) {
		blastCivilians(game, x, z, ROCKET.radius * 0.75, 100);
		scarePeds(x, z, 130);
	}
}

// ---------- civilians (the cars and the pedestrians of world.js) ----------

// the nearest civil car or pedestrian on the aim line, or null. It gives { car or ped, x, z }.
function findCivilian(game) {
	var best = game.aim.t + 4, found = null, i, ex, ey, ez, along, r;
	for (i = 0; i < city.cars.length; i++) {
		var car = city.cars[i];
		if (car.dead > 0 || car.y < -5) {
			continue;
		}
		ex = car.x - aimFrom.x;
		ey = car.y + 0.8 - aimFrom.y;
		ez = car.z - aimFrom.z;
		along = ex * aimDir.x + ey * aimDir.y + ez * aimDir.z;
		r = 2.6 * car.long + along * 0.009;
		if (along > 4 && along < best && ex * ex + ey * ey + ez * ez - along * along < r * r) {
			best = along;
			found = { car: car, ped: null, x: car.x, z: car.z };
		}
	}
	for (i = 0; i < city.peds.length; i++) {
		var ped = city.peds[i];
		if (ped.state === 2) {
			continue;
		}
		ex = ped.x - aimFrom.x;
		ey = 1.1 - aimFrom.y;
		ez = ped.z - aimFrom.z;
		along = ex * aimDir.x + ey * aimDir.y + ez * aimDir.z;
		r = 1.2 + along * 0.009;
		if (along > 4 && along < best && ex * ex + ey * ey + ez * ez - along * along < r * r) {
			best = along;
			found = { car: null, ped: ped, x: ped.x, z: ped.z };
		}
	}
	return found;
}

function addCrime(game, amount) {
	game.heat = Math.min(5, game.heat + amount);
	game.crimeT = CRIME.calm;
}

function hurtPed(game, ped) {
	if (ped.state === 2) {
		return;
	}
	dropPed(ped);
	addCrime(game, CRIME.ped);
}

// a civil car explodes when its hp is 0. The explosion hits the things near it.
function hurtCar(game, car, damage) {
	if (car.dead > 0) {
		return;
	}
	car.hp -= damage;
	if (car.hp > 0) {
		return;
	}
	wreckCar(car);
	addBoom(game, car.x, car.y + 1.5, car.z, 9, 0xffa040, 0.6);
	addBoom(game, car.x, car.y + 4, car.z, 6, 0x3a3632, 1.4);
	playNoise(game, 0.9, 300, 0.45);
	addCrime(game, CRIME.car);
	scarePeds(car.x, car.z, 90);
	blastCivilians(game, car.x, car.z, 9, 20);
}

// an explosion at x, z on the street: damage to the cars, and the pedestrians go down
function blastCivilians(game, x, z, radius, damage) {
	var i, dx, dz;
	for (i = 0; i < city.peds.length; i++) {
		dx = city.peds[i].x - x;
		dz = city.peds[i].z - z;
		if (dx * dx + dz * dz < radius * radius) {
			hurtPed(game, city.peds[i]);
		}
	}
	for (i = 0; i < city.cars.length; i++) {
		var car = city.cars[i];
		dx = car.x - x;
		dz = car.z - z;
		if (car.dead <= 0 && car.y > -5 && car.y < 30 && dx * dx + dz * dz < radius * radius) {
			hurtCar(game, car, damage);
		}
	}
}

// smoke from the wrecks near the player
function smokeWrecks(game) {
	var p = game.player, n = 0;
	for (var i = 0; i < city.cars.length && n < 6; i++) {
		var car = city.cars[i];
		if (car.dead > 0 && Math.abs(car.x - p.x) < 500 && Math.abs(car.z - p.z) < 500) {
			addBoom(game, car.x + game.rnd() * 2 - 1, car.y + 3 + game.rnd() * 3, car.z + game.rnd() * 2 - 1, 3.5, 0x2a2a2a, 1.3);
			n++;
		}
	}
}

// ---------- enemies ----------

// cop: true for the police. The police do not count as targets of a wave.
function addEnemy(game, stats, group, cop) {
	var e = { stats: stats, group: group, marker: new THREE.Sprite(cop ? game.copMarkerMat : game.markerMat), x: 0, y: 0, z: 0, hp: stats.hp, fireT: 1 + game.rnd() * stats.wait, burst: 0, car: null, gun: null, rotor: null, a: 0, cop: cop, leaveT: 0, lights: null };
	e.marker.scale.set(0.035, 0.035, 1);
	e.marker.renderOrder = 997;
	game.scene.add(group);
	game.scene.add(e.marker);
	game.enemies.push(e);
	return e;
}

// a red van with a gun. It drives on the streets.
function spawnVan(game) {
	var group = new THREE.Group();
	var mesh = new THREE.Mesh(game.geo.van, game.mat);
	mesh.scale.setScalar(1.6);
	group.add(mesh);
	var e = addEnemy(game, VAN, group, false);
	e.car = roadCarAt(game, 0, 99999);
	e.car.speed = 11;
}

// a new car on a street, not in a place with no streets, and from near to far m from the player
function roadCarAt(game, near, far) {
	var p = game.player, car = null;
	for (var tries = 0; tries < 200; tries++) {
		car = newRoadCar(game.rnd, false);
		moveRoadCar(car, 0, true);
		var d = Math.sqrt((car.x - p.x) * (car.x - p.x) + (car.z - p.z) * (car.z - p.z));
		if (!inZone(car.x, car.z) && d >= near && d <= far) {
			break;
		}
	}
	return car;
}

// a gun on a roof
function spawnTurret(game) {
	var p = game.player;
	var best = null;
	for (var tries = 0; tries < 300 && !best; tries++) {
		var i = 4 + Math.floor(game.rnd() * 32), j = 4 + Math.floor(game.rnd() * 32);
		var lots = city.lots[i * GRID + j];
		if (lots.length === 0) {
			continue;
		}
		var b = lots[Math.floor(game.rnd() * lots.length)];
		var x = (b[0] + b[1]) / 2, z = (b[2] + b[3]) / 2;
		var d = Math.sqrt((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z));
		if (b[4] > 12 && b[4] < 120 && d > 350 && d < 1900) {
			best = { x: x, y: b[4], z: z };
		}
	}
	if (!best) {
		return;
	}
	var group = new THREE.Group();
	var base = new THREE.Mesh(game.geo.base, game.mat);
	base.scale.setScalar(1.5);
	group.add(base);
	var gun = new THREE.Mesh(game.geo.gun, game.mat);
	gun.scale.setScalar(1.5);
	gun.position.y = 2.4;
	group.add(gun);
	var e = addEnemy(game, TURRET, group, false);
	e.gun = gun;
	e.x = best.x;
	e.y = best.y;
	e.z = best.z;
	group.position.set(e.x, e.y, e.z);
}

// an enemy helicopter (a gunship or the police). It flies around the player.
function spawnGunship(game, stats, geo, cop) {
	var p = game.player;
	var group = new THREE.Group();
	group.add(new THREE.Mesh(geo, game.mat));
	var rotor = new THREE.Mesh(game.geo.rotor, game.mat);
	rotor.position.y = 1.5;
	group.add(rotor);
	var e = addEnemy(game, stats, group, cop);
	e.rotor = rotor;
	e.a = game.rnd() * Math.PI * 2;
	e.x = clamp(p.x + Math.cos(e.a) * 1000, -3000, 3000);
	e.z = clamp(p.z + Math.sin(e.a) * 1000, -1500, 3000);
	e.y = Math.max(200, roofAt(e.x, e.z) + 40);
}

function updateEnemies(game, dt) {
	var p = game.player;
	for (var i = 0; i < game.enemies.length; i++) {
		var e = game.enemies[i];
		if (e.car) {
			if (e.cop && e.leaveT <= 0) {
				steerCopCar(game, e.car, dt);
			} else {
				moveRoadCar(e.car, dt, true);
			}
			e.x = e.car.x;
			e.z = e.car.z;
			e.y = e.car.y;
			e.group.rotation.y = e.car.yaw;
		}
		if (e.gun) {
			e.gun.lookAt(p.x, p.y + 1, p.z);
		}
		if (e.rotor) {
			// fly to a point on a circle around the player
			e.a += 0.12 * dt;
			var ring = e.leaveT > 0 ? 3000 : 230;
			var tx = p.x + Math.cos(e.a) * ring - e.x, tz = p.z + Math.sin(e.a) * ring - e.z;
			var td = Math.sqrt(tx * tx + tz * tz) + 0.001;
			var sp = Math.min(34, td);
			e.x += tx / td * sp * dt;
			e.z += tz / td * sp * dt;
			e.y = approach(e.y, Math.max(p.y + 8, roofAt(e.x, e.z) + 30), 12 * dt);
			e.group.rotation.y = Math.atan2(e.x - p.x, e.z - p.z);
			e.rotor.rotation.y += 11 * dt;
		}
		e.group.position.set(e.x, e.y, e.z);
		e.marker.position.set(e.x, e.y + e.stats.up + 11, e.z);

		// fire
		var dx = p.x - e.x, dy = p.y + 1 - e.y - e.stats.up, dz = p.z - e.z;
		var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
		if (e.lights) {
			// red and blue, one after the other
			var on = Math.floor(game.time * 5) % 2 === 0;
			e.lights[0].visible = on;
			e.lights[1].visible = !on;
		}
		if (d < e.stats.range && p.deadT <= 0 && e.leaveT <= 0) {
			e.fireT -= dt;
			if (e.fireT <= 0) {
				fireShell(game, e, d);
				// a gunship fires 3 shells one after the other
				e.burst++;
				if (e.rotor && e.burst < 3) {
					e.fireT = 0.25;
				} else {
					e.burst = 0;
					e.fireT = e.stats.wait * (0.7 + game.rnd() * 0.6);
				}
			}
		}
	}
}

function hurtEnemy(game, e, damage) {
	if (e.hp <= 0) {
		return;
	}
	e.hp -= damage;
	if (e.hp > 0) {
		return;
	}
	addBoom(game, e.x, e.y + e.stats.up, e.z, 16, 0xffa040, 0.7);
	addBoom(game, e.x, e.y + e.stats.up + 5, e.z, 11, 0x3a3632, 1.6);
	playNoise(game, 1.3, 260, 0.6);
	removeEnemy(game, e);
	game.score += e.stats.score;
	if (e.cop) {
		addCrime(game, CRIME.cop);
	}
	if (e.car) {
		scarePeds(e.x, e.z, 90);
		blastCivilians(game, e.x, e.z, 9, 20);
	}
}

function removeEnemy(game, e) {
	game.scene.remove(e.group);
	game.scene.remove(e.marker);
	game.enemies.splice(game.enemies.indexOf(e), 1);
}

// ---------- police ----------

function wantedStars(game) {
	return Math.min(5, Math.ceil(game.heat - 0.0001));
}

function spawnCopCar(game) {
	var group = new THREE.Group();
	var mesh = new THREE.Mesh(game.geo.copCar, game.mat);
	mesh.scale.setScalar(1.5);
	group.add(mesh);
	var lightGeo = new THREE.BoxGeometry(0.7, 0.35, 0.5);
	var red = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, fog: false }));
	var blue = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x3a6aff, fog: false }));
	red.position.set(-0.6, 3.1, 0.3);
	blue.position.set(0.6, 3.1, 0.3);
	group.add(red);
	group.add(blue);
	var e = addEnemy(game, COP_CAR, group, true);
	e.lights = [red, blue];
	e.car = roadCarAt(game, 300, 750);
	e.car.speed = 22;
}

// a police car drives to the player. At each crossing it takes the street that goes nearer.
function steerCopCar(game, car, dt) {
	var p = game.player;
	var dx = p.x - car.x, dz = p.z - car.z;
	car.speed = dx * dx + dz * dz < 90 * 90 ? 0 : 22;
	var next = car.pos + car.dir * car.speed * dt;
	var lo = Math.min(car.pos, next), hi = Math.max(car.pos, next);
	var cross = CITY_MIN + Math.floor((hi - CITY_MIN) / CELL) * CELL;
	if (cross > lo && cross <= hi && cross > CITY_MIN && cross < CITY_MAX) {
		var along = (car.axis === 0 ? p.x : p.z) - cross;
		var across = (car.axis === 0 ? p.z : p.x) - car.line;
		if (Math.abs(across) > 70 && (Math.abs(across) > Math.abs(along) || along * car.dir < 0)) {
			// turn into the other street
			car.pos = car.line;
			car.line = cross;
			car.axis = 1 - car.axis;
			car.dir = across > 0 ? 1 : -1;
		} else if (along * car.dir < 0 && Math.abs(along) > 70) {
			car.dir = -car.dir;
		}
	}
	moveRoadCar(car, dt, true);
}

// the wanted level goes away with no new crime. The police come and go with the stars.
function updateWanted(game, dt) {
	game.crimeT -= dt;
	if (game.crimeT <= 0) {
		game.heat = Math.max(0, game.heat - dt / CRIME.fade);
	}
	var stars = wantedStars(game), cars = 0, helis = 0, i, e;
	for (i = game.enemies.length - 1; i >= 0; i--) {
		e = game.enemies[i];
		if (!e.cop) {
			continue;
		}
		if (e.leaveT > 0) {
			e.leaveT -= dt;
			if (e.leaveT <= 0) {
				removeEnemy(game, e);
			}
		} else if (stars === 0) {
			e.leaveT = 10;                   // no stars: the police stop the fire and go away
			if (e.car) {
				e.car.speed = 22;
			}
		} else if (e.car) {
			cars++;
		} else {
			helis++;
		}
	}
	game.copT -= dt;
	if (game.copT <= 0 && game.player.deadT <= 0) {
		game.copT = 2.5;
		if (cars < Math.min(stars, 4)) {
			spawnCopCar(game);
		} else if (helis < stars - 2) {
			spawnGunship(game, COP_HELI, game.geo.copHeli, true);
		}
	}
}

// the number of enemies that are not the police
function countTargets(game) {
	var n = 0;
	for (var i = 0; i < game.enemies.length; i++) {
		if (!game.enemies[i].cop) {
			n++;
		}
	}
	return n;
}

// ---------- shells (the enemy fire) ----------

function fireShell(game, e, d) {
	if (game.shells.length >= SHELL.max) {
		return;
	}
	var p = game.player;
	var fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
	// aim in front of the player, with an error
	var lead = d / SHELL.speed * 0.6, err = 4 + d * 0.014;
	var sx = e.x, sy = e.y + e.stats.up, sz = e.z;
	var tx = p.x + fx * p.speed * lead + (game.rnd() - 0.5) * 2 * err - sx;
	var ty = p.y + 1 + p.climb * lead + (game.rnd() - 0.5) * 2 * err - sy;
	var tz = p.z + fz * p.speed * lead + (game.rnd() - 0.5) * 2 * err - sz;
	var len = Math.sqrt(tx * tx + ty * ty + tz * tz);
	game.shells.push({ x: sx, y: sy, z: sz, vx: tx / len * SHELL.speed, vy: ty / len * SHELL.speed, vz: tz / len * SHELL.speed, life: SHELL.life });
}

var shellDummy = new THREE.Object3D();

function updateShells(game, dt) {
	var p = game.player;
	for (var i = game.shells.length - 1; i >= 0; i--) {
		var s = game.shells[i];
		s.x += s.vx * dt;
		s.y += s.vy * dt;
		s.z += s.vz * dt;
		s.life -= dt;
		var dx = s.x - p.x, dy = s.y - p.y - 1, dz = s.z - p.z;
		var gone = s.life <= 0 || s.y < 0;
		if (dx * dx + dy * dy + dz * dz < 3.2 * 3.2 && p.deadT <= 0) {
			hurtPlayer(game, SHELL.damage);
			gone = true;
		} else if (s.life < SHELL.life - 0.15 && roofAt(s.x, s.z) > s.y) {
			gone = true;                     // a building stops it
		}
		if (gone) {
			game.shells.splice(i, 1);
		}
	}
	for (var k = 0; k < game.shells.length; k++) {
		shellDummy.position.set(game.shells[k].x, game.shells[k].y, game.shells[k].z);
		shellDummy.updateMatrix();
		game.shellMesh.setMatrixAt(k, shellDummy.matrix);
	}
	game.shellMesh.count = game.shells.length;
	game.shellMesh.instanceMatrix.needsUpdate = true;
}

function hurtPlayer(game, damage) {
	var p = game.player;
	p.hp -= damage;
	p.hurtT = 6;
	game.shade.material.color.setHex(0xff2010);
	game.shade.material.opacity = 0.22;
	playNoise(game, 0.2, 500, 0.5);
	if (p.hp <= 0) {
		// the helicopter is down. There is no fall: the view goes dark and you start again.
		p.hp = 0;
		p.deadT = 3;
		game.message = 'HELICOPTER DOWN  -500';
		game.messageT = 3;
		playNoise(game, 1.5, 200, 0.7);
	}
}

// the dark ball, the time after a hit, and the new start
function updateShade(game, dt) {
	var p = game.player, mat = game.shade.material;
	if (p.deadT > 0) {
		p.deadT -= dt;
		mat.color.setHex(0x000000);
		mat.opacity = p.deadT > 2 ? 3 - p.deadT : Math.min(1, p.deadT);
		if (p.deadT < 1 && p.hp === 0) {
			// in the dark: back to the start
			p.x = START.x;
			p.y = START.y;
			p.z = START.z;
			p.yaw = START.yaw;
			p.speed = 0;
			p.climb = 0;
			p.turn = 0;
			p.hp = 100;
			game.shells.length = 0;
			game.heat = 0;
			game.score = Math.max(0, game.score - 500);
			placePlayer(game);
		}
	} else {
		mat.opacity = Math.max(0, mat.opacity - dt * 1.2);
		p.hurtT -= dt;
		if (p.hurtT <= 0 && p.hp < 100) {
			p.hp = Math.min(100, p.hp + 4 * dt);
		}
	}
	game.shade.visible = mat.opacity > 0.01;
}

// ---------- effects ----------

function addBoom(game, x, y, z, size, color, dur) {
	for (var i = 0; i < game.booms.length; i++) {
		var b = game.booms[i];
		if (b.t <= 0) {
			b.t = dur;
			b.dur = dur;
			b.size = size;
			b.mesh.position.set(x, y, z);
			b.mesh.material.color.setHex(color);
			b.mesh.visible = true;
			return;
		}
	}
}

function updateEffects(game, dt) {
	for (var i = 0; i < game.booms.length; i++) {
		var b = game.booms[i];
		if (b.t > 0) {
			b.t -= dt;
			var k = 1 - b.t / b.dur;
			b.mesh.scale.setScalar(b.size * (0.3 + 0.7 * Math.sqrt(k)));
			b.mesh.material.opacity = 0.9 * (1 - k);
			b.mesh.visible = b.t > 0;
		}
	}
	for (var j = 0; j < game.tracers.length; j++) {
		var tr = game.tracers[j];
		if (tr.t > 0) {
			tr.t -= dt;
			tr.mesh.visible = tr.t > 0;
		}
	}
}

// ---------- waves ----------

function startWave(game) {
	game.wave++;
	var n = game.wave;
	for (var a = 0; a < 3 + n; a++) {
		spawnVan(game);
	}
	for (var b = 0; b < 1 + n; b++) {
		spawnTurret(game);
	}
	for (var c = 0; c < Math.floor(n / 2); c++) {
		spawnGunship(game, GUNSHIP, game.geo.ship, false);
	}
	game.message = 'WAVE ' + n;
	game.messageT = 4;
}

function updateWaves(game, dt) {
	game.messageT -= dt;
	if (countTargets(game) > 0) {
		return;
	}
	if (game.waveT <= 0) {
		// the wave is done
		game.waveT = 5;
		game.score += 500;
		game.player.hp = 100;
		game.message = 'WAVE ' + game.wave + ' CLEAR  +500';
		game.messageT = 4;
		return;
	}
	game.waveT -= dt;
	if (game.waveT <= 0) {
		startWave(game);
	}
}

// ---------- panel ----------

function drawPanel(game) {
	var c = game.panel.c, p = game.player;
	c.fillStyle = '#0c1410';
	c.fillRect(0, 0, 512, 256);
	c.strokeStyle = '#2f5a3a';
	c.lineWidth = 3;
	c.strokeRect(2, 2, 508, 252);

	// armor
	c.font = 'bold 26px monospace';
	c.textAlign = 'left';
	c.textBaseline = 'middle';
	c.fillStyle = '#7dff9a';
	c.fillText('ARMOR', 16, 30);
	c.strokeRect(120, 16, 170, 28);
	c.fillStyle = p.hp > 35 ? '#7dff9a' : '#ff5a40';
	c.fillRect(123, 19, 164 * p.hp / 100, 22);

	c.fillStyle = '#7dff9a';
	c.fillText('SCORE  ' + game.score, 16, 72);
	c.fillText('WAVE   ' + game.wave, 16, 106);
	c.fillText('TARGETS ' + countTargets(game), 16, 140);
	// the wanted stars
	var stars = wantedStars(game);
	c.fillText('WANTED', 16, 174);
	for (var s = 0; s < 5; s++) {
		c.fillStyle = s < stars ? '#ffd24a' : '#2f5a3a';
		c.fillText('\u2605', 126 + s * 30, 174);
	}
	c.fillStyle = '#7dff9a';
	c.font = 'bold 20px monospace';
	c.fillText('ALT ' + Math.round(p.y) + '  SPD ' + Math.round(Math.abs(p.speed) * 3.6) + '  AIM ' + (game.aimHead ? 'HEAD' : 'HAND'), 16, 204);
	c.font = 'bold 26px monospace';
	if (game.messageT > 0) {
		c.fillStyle = '#ffd24a';
		c.fillText(game.message, 16, 234);
	}

	// radar: the nose is up, the range is 1500 m
	var rx = 400, ry = 128, rr = 96;
	c.strokeStyle = '#2f8a4a';
	c.lineWidth = 2;
	c.beginPath();
	c.arc(rx, ry, rr, 0, Math.PI * 2);
	c.moveTo(rx + rr / 2, ry);
	c.arc(rx, ry, rr / 2, 0, Math.PI * 2);
	c.moveTo(rx, ry - rr);
	c.lineTo(rx, ry + rr);
	c.moveTo(rx - rr, ry);
	c.lineTo(rx + rr, ry);
	c.stroke();
	var sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
	for (var i = 0; i < game.enemies.length; i++) {
		var e = game.enemies[i];
		var dx = e.x - p.x, dz = e.z - p.z;
		var fwd = -dx * sin - dz * cos, right = dx * cos - dz * sin;
		var d = Math.sqrt(fwd * fwd + right * right) + 0.001;
		var k = Math.min(d, 1500) / 1500 * rr / d;
		c.fillStyle = e.cop ? '#4aa0ff' : (e.rotor ? '#ffd24a' : '#ff4a3a');
		c.fillRect(rx + right * k - 4, ry - fwd * k - 4, 8, 8);
	}
	c.fillStyle = '#7dff9a';
	c.beginPath();
	c.moveTo(rx, ry - 8);
	c.lineTo(rx + 6, ry + 6);
	c.lineTo(rx - 6, ry + 6);
	c.fill();
	game.panel.tex.needsUpdate = true;
}

// ---------- sound ----------

// make the sound system at the first input. It also starts the rotor sound.
function startAudio(game) {
	if (game.audio) {
		return;
	}
	var AC = window.AudioContext || window.webkitAudioContext;
	if (!AC) {
		return;
	}
	var ctx = new AC();
	var noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
	var data = noise.getChannelData(0);
	for (var i = 0; i < data.length; i++) {
		data[i] = Math.random() * 2 - 1;
	}
	game.audio = { ctx: ctx, noise: noise };

	// rotor: noise that a slow wave makes louder and quieter
	var src = ctx.createBufferSource();
	src.buffer = noise;
	src.loop = true;
	var filter = ctx.createBiquadFilter();
	filter.type = 'lowpass';
	filter.frequency.value = 260;
	var gain = ctx.createGain();
	gain.gain.value = 0.22;
	var lfo = ctx.createOscillator();
	lfo.frequency.value = 13;
	var depth = ctx.createGain();
	depth.gain.value = 0.16;
	lfo.connect(depth);
	depth.connect(gain.gain);
	src.connect(filter);
	filter.connect(gain);
	gain.connect(ctx.destination);
	src.start();
	lfo.start();
}

// a short noise: gun, rocket, explosion, hit
function playNoise(game, dur, freq, volume) {
	if (!game.audio) {
		return;
	}
	var ctx = game.audio.ctx;
	var src = ctx.createBufferSource();
	src.buffer = game.audio.noise;
	var filter = ctx.createBiquadFilter();
	filter.type = 'lowpass';
	filter.frequency.value = freq;
	var gain = ctx.createGain();
	gain.gain.setValueAtTime(volume, ctx.currentTime);
	gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
	src.connect(filter);
	filter.connect(gain);
	gain.connect(ctx.destination);
	src.start(ctx.currentTime, Math.random(), dur);
}

// ---------- update ----------

// input: move, turn, climb (-1..1), gun, rocket (true or false), swapAim (true for one frame)
function updateGame(game, input, dt) {
	var p = game.player;
	game.time += dt;
	if (input.swapAim) {
		game.aimHead = !game.aimHead;
		game.message = game.aimHead ? 'AIM WITH THE HEAD' : 'AIM WITH THE CONTROLLER';
		game.messageT = 3;
	}
	if (p.deadT > 0) {
		input = { move: 0, turn: 0, climb: 0, gun: false, rocket: false };
	}
	flyPlayer(game, input, dt);
	p.group.updateMatrixWorld(true);
	findAim(game);
	p.gunT -= dt;
	p.rocketT -= dt;
	if (input.gun && p.gunT <= 0) {
		fireGun(game);
	}
	if (input.rocket && p.rocketT <= 0) {
		fireRocket(game);
	}
	updateRockets(game, dt);
	updateEnemies(game, dt);
	updateShells(game, dt);
	updateShade(game, dt);
	updateEffects(game, dt);
	if (game.started) {
		updateWaves(game, dt);
		updateWanted(game, dt);
	}
	game.smokeT -= dt;
	if (game.smokeT <= 0) {
		game.smokeT = 0.5;
		smokeWrecks(game);
	}
	game.panelT -= dt;
	if (game.panelT <= 0) {
		game.panelT = 0.2;
		drawPanel(game);
	}
}
