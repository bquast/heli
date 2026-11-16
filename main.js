// main.js - the renderer, the VR session, the input and the loop.
// Classic script. It uses makeCity(), updateCity() from world.js and makeGame(), updateGame(), startAudio() from game.js.
//
// Controls:
//   VR:       left stick: forward, back, turn.   right stick up and down: height.
//             right trigger: gun.   left trigger: rocket.
//             You aim with the right controller. A or X changes to aim with the head, and back.
//   desktop:  W S: forward, back.   A D: turn.   R F: height.
//             the trackpad or the mouse moves the view and the aim.   SPACE or click: gun.   E or right click: rocket.
//             (T changes the aim mode. On the desktop the two modes are the same.)

var renderer, scene, camera, game;
var keys = {};
var look = { yaw: 0, pitch: -0.15 };     // the desktop view, relative to the cockpit
var mouse = { gun: false, rocket: false };
var lastMs = 0;
var swapDown = false;                    // the button that changes the aim mode was down in the last frame

function main() {
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.xr.enabled = true;
	renderer.xr.setFoveation(1);
	document.body.appendChild(renderer.domElement);

	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.15, 10000);
	camera.rotation.order = 'YXZ';
	makeCity(scene, START.x, START.z);
	game = makeGame(scene, camera, renderer);

	window.addEventListener('resize', function () {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight);
	});
	setupDesktop();
	setupVR();
	renderer.setAnimationLoop(frame);
}

// the first click, key or VR session starts the game and the sound
function start() {
	if (!game.started) {
		game.started = true;
		document.getElementById('help').style.display = 'none';
	}
	startAudio(game);
}

// ---------- desktop ----------

function setupDesktop() {
	var canvas = renderer.domElement;
	window.addEventListener('keydown', function (e) {
		keys[e.code] = true;
		if (e.code === 'Space') {
			e.preventDefault();
		}
		start();
	});
	window.addEventListener('keyup', function (e) {
		keys[e.code] = false;
	});
	// the view follows the pointer with no button pressed. A click locks the pointer in the window.
	window.addEventListener('mousemove', function (e) {
		if (!game.started) {
			return;
		}
		look.yaw = clamp(look.yaw - e.movementX * 0.0025, -2.6, 2.6);
		look.pitch = clamp(look.pitch - e.movementY * 0.0025, -1.45, 1.2);
	});
	canvas.addEventListener('mousedown', function (e) {
		if (game.started && document.pointerLockElement === canvas) {
			if (e.button === 2) {
				mouse.rocket = true;
			} else {
				mouse.gun = true;
			}
		}
		if (canvas.requestPointerLock && !renderer.xr.isPresenting) {
			canvas.requestPointerLock();
		}
		start();
	});
	window.addEventListener('mouseup', function () {
		mouse.gun = false;
		mouse.rocket = false;
	});
	canvas.addEventListener('contextmenu', function (e) {
		e.preventDefault();
	});
	document.getElementById('help').addEventListener('click', function () {
		start();
		if (canvas.requestPointerLock) {
			canvas.requestPointerLock();
		}
	});
}

// ---------- VR ----------

function setupVR() {
	var button = document.getElementById('vr');
	if (!navigator.xr) {
		button.textContent = 'NO VR HERE';
		return;
	}
	navigator.xr.isSessionSupported('immersive-vr').then(function (ok) {
		if (!ok) {
			button.textContent = 'NO VR HERE';
			return;
		}
		button.textContent = 'ENTER VR';
		button.disabled = false;
	});
	button.addEventListener('click', function (e) {
		e.stopPropagation();
		if (renderer.xr.isPresenting) {
			renderer.xr.getSession().end();
			return;
		}
		navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] }).then(function (session) {
			renderer.xr.setSession(session);
			button.textContent = 'EXIT VR';
			start();
			session.addEventListener('end', function () {
				button.textContent = 'ENTER VR';
				camera.position.set(EYE.x, EYE.y, EYE.z);
			});
		});
	});
}

// ---------- input ----------

function dead(v) {
	return Math.abs(v) < 0.15 ? 0 : v;
}

function readInput() {
	var input = { move: 0, turn: 0, climb: 0, gun: false, rocket: false, swapAim: false };
	var swap = keys.KeyT === true;
	// keys and mouse
	input.move = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
	input.turn = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
	input.climb = (keys.KeyR ? 1 : 0) - (keys.KeyF ? 1 : 0);
	input.gun = keys.Space === true || mouse.gun;
	input.rocket = keys.KeyE === true || mouse.rocket;
	// Quest controllers
	var session = renderer.xr.getSession();
	if (session) {
		for (var i = 0; i < session.inputSources.length; i++) {
			var src = session.inputSources[i], pad = src.gamepad;
			if (!pad || pad.axes.length < 4) {
				continue;
			}
			var trigger = pad.buttons.length > 0 && pad.buttons[0].pressed;
			swap = swap || (pad.buttons.length > 4 && pad.buttons[4].pressed);       // A on the right, X on the left
			if (src.handedness === 'left') {
				input.turn += dead(pad.axes[2]);
				input.move += -dead(pad.axes[3]);
				input.rocket = input.rocket || trigger;
			} else {
				input.climb += -dead(pad.axes[3]);
				input.gun = input.gun || trigger;
			}
		}
	}
	// the aim mode changes one time for each press
	input.swapAim = swap && !swapDown;
	swapDown = swap;
	input.move = clamp(input.move, -1, 1);
	input.turn = clamp(input.turn, -1, 1);
	input.climb = clamp(input.climb, -1, 1);
	return input;
}

// ---------- loop ----------

function frame(ms) {
	var dt = Math.min(0.05, (ms - lastMs) / 1000);
	lastMs = ms;
	if (!renderer.xr.isPresenting) {
		camera.position.set(EYE.x, EYE.y, EYE.z);
		camera.rotation.set(look.pitch, look.yaw, 0);
	}
	updateCity(dt, game.player.x, game.player.z);
	updateGame(game, readInput(), dt);
	renderer.render(scene, camera);
}

main();
