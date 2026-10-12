let particleScale = window.innerWidth * 0.05; // scale factor for particle size (higher value = smaller particles)
let particleSize = window.innerWidth / particleScale; // 'true' logical dimensions of particle used for computation
let particleRadius = particleSize / 2;
let particleVisualSize = particleSize / 5; // visual dimensions of particles as drawn by the trails
let jitterDist = window.innerWidth * 0.002; // jitter intensity of trail particles
let flockSize = 98; // total number of 'true boids' in each flock
let trailLength = 15; // number of trail particles to draw
let alignmentRadius = particleRadius * 1.5; // the radius around which a particle aligns itself with flock mates
let cohesionRadius = particleRadius * 2; // the radius around which a particle coheres itself with flock mates
let avoidanceRadius = particleRadius * 1.75; // the radius around which a particle begins to avoid flock mates

let flock1 = [];
let palette1 = ['#747EAB', '#E74F00', '#E74F00'];
let flock2 = [];
let palette2 = ['#29B29E', '#5292ED', '#5292ED'];

let wanderers = [];
let captured = [];
let totalTransfers = 0;

let quadTreeCap = 1;
let qtreeLookupRadius = Math.max(alignmentRadius, cohesionRadius, avoidanceRadius) / 2;

let mouseTimer;
let mouseMoving = false;
let scene4Ended = false; // triggers when all particles have been transformed

function setup() {
	// canvas set to half window resolution and pixel doubled with CSS
	let canvas = createCanvas(windowWidth / 2, windowHeight / 2);
	canvas.id('scene4');
	canvas.parent('scene4_container');
	frameRate(30);

	canvas.mouseMoved(mouseMoved);
	grained('#scene4_container', grainSettings);

	// init flocks

	for (let i = 0; i < flockSize; i++) {
		let p = new Particle(random((width / 4) * 3, (width / 5) * 4), random(height / 3, height / 4), palette1, 'flock1');
		flock1.push(p);
	}

	for (let i = 0; i < flockSize; i++) {
		let p = new Particle(random(width / 4, width / 5), random((height / 3) * 2, (height / 4) * 3), palette2, 'flock2');
		p.setIndex(i);
		flock2.push(p);
	}

	// init wanderers

	for (let i = 0; i < 2; i++) {
		let w = new Wanderer(random(width), random(height), false);
		wanderers.push(w);
	}
	wanderers[0].controllable = true; // sets first wanderer to be controlled by cursor
}

function draw() {
	background('#D9D1B1');

	// create quadtree

	let boundary = new Rectangle(windowWidth / 2, windowHeight / 2, windowWidth / 2, windowHeight / 2);
	let quadTree = new QuadTree(boundary, quadTreeCap);

	// animate & render particles while updating quadtree

	for (particle of flock1) {
		quadTree.insert(particle);
		particle.update();
		particle.render();
		let range = new Circle(particle.position.x, particle.position.y, qtreeLookupRadius);
		let flockMates = quadTree.query(range);
		for (p of flockMates) {
			p.flock(flockMates);
			p.highlight(flockMates);
		}
		particle.seek(wanderers[0]);
	}

	for (particle of flock2) {
		quadTree.insert(particle);
		particle.update();
		particle.render();
		let range = new Circle(particle.position.x, particle.position.y, qtreeLookupRadius);
		let flockMates = quadTree.query(range);
		for (p of flockMates) {
			p.flock(flockMates);
			p.highlight(flockMates);
		}
		if (particle.transformed) {
			particle.seek(wanderers[0]);
		} else {
			particle.seek(wanderers[1]);
		}
	}

	// animate wanderers

	for (wanderer of wanderers) {
		wanderer.update();
		wanderer.render();
	}

	// Debugging

	if (showDebugView) {
		quadTree.showQuadtree();
		quadTreeSelection(quadTree);
	}
	if (showFPS) {
		showFrameRate();
	} else if (!showFPS) {
		showFrameRate();
	}
}

// transform captured particles from flock2 to flock1

let transformTimer = setInterval(transformParticles, 5);

function transformParticles() {
	if (captured.length > 0) {
		let particleID = captured[0].particleID;
		flock2[particleID].transform(); // swap particle attributes to mimic flock1
		captured.splice(0, 1); // remove transformed particle from captured list
	}
	const transformed = flock2.reduce((count, particle) => (particle.transformed === true ? ++count : count), 0);
	if (captured.length == 0 && transformed == flockSize) {
		clearInterval(transformTimer);
		console.log('scene ended');
		scene4Ended = true;
	}
}

// detect if mouse is moving

function mouseMoved() {
	mouseMoving = true;
	scene4cursorSprite.style.width = '35px';
	scene4cursorSprite.style.height = '35px';
	scene4cursorSprite.classList.remove('scene4-cursor-sprite-hidden');
	clearTimeout(mouseTimer);
	mouseTimer = setTimeout(mouseStopped, 500);
}

function mouseStopped() {
	mouseMoving = false;
	scene4cursorSprite.style.width = '15px';
	scene4cursorSprite.style.height = '15px';
	scene4cursorSprite.classList.add('scene4-cursor-sprite-hidden');
}

// custom cursor setup

var scene4cursor = document.getElementById('sc4_cursor');
var scene4cursorSprite = document.getElementById('sc4_cursor_spr');

function scene4CustomCursor(e) {
	scene4cursorSprite.style.opacity = 1;
	scene4cursor.style.left = e.pageX - scene4cursor.offsetWidth / 2 + 'px';
	scene4cursor.style.top = e.pageY - scene4cursor.offsetHeight / 2 + 'px';
}

function hideScene4CustomCursor() {
	// hides custom cursor within scene and returns browser pointer
	scene4cursorSprite.style.opacity = 0;
	setTimeout(function() {
		scene4cursor.style.display = 'none';
		document.getElementById('scene4_container').removeEventListener('mousemove', scene4CustomCursor);
		document.getElementById('scene4_container').removeEventListener('touchmove', scene4CustomCursor);
		document.getElementById('scene4_container').style.cursor = 'default';
	}, 600);
}

function showScene4CustomCursor() {
	// shows custom cursor within scene and hides browser pointer
	scene4cursor.style.display = 'flex';
	document.getElementById('scene4_container').style.cursor = 'none';
	document.getElementById('scene4_container').addEventListener('mousemove', scene4CustomCursor);
	document.getElementById('scene4_container').addEventListener('touchmove', scene4CustomCursor);
}

document.getElementById('scene4_container').addEventListener('mousemove', scene4CustomCursor);
document.getElementById('scene4_container').addEventListener('touchmove', scene4CustomCursor);
document.getElementById('scene4_container').addEventListener('touchmove', mouseMoved);

// grain overlay settings

var grainSettings = {
	animate: true,
	patternWidth: 300,
	patternHeight: 300,
	grainOpacity: 0.027,
	grainDensity: 2,
	grainWidth: 2,
	grainHeight: 2,
	grainChaos: 0.2,
	grainSpeed: 15,
};
