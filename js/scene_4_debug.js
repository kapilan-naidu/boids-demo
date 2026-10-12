let paused = false;
let showDebugView = false;
let showFPS = false;

function keyPressed() {
	if (keyCode === 32 && !paused) {
		// press space to pause sketch
		noLoop();
		paused = !paused;
	} else if (keyCode === 32 && paused) {
		loop();
		paused = !paused;
	} else if (keyCode === 81) {
		// press 'Q' to toggle debug view
		showDebugView = !showDebugView;
	} else if (keyCode === 74 && jitter) {
		// press 'F' to toggle FPS
	} else if (keyCode === 70) {
		showFPS = !showFPS;
	}
}

function quadTreeSelection(quadTree) {
	//interactive quadtree selection
	stroke(0, 255, 0);
	strokeWeight(2);
	noFill();
	// rectMode(CENTER);
	// let range = new Rectangle(mouseX, mouseY, qtreeLookupRadius, qtreeLookupRadius);
	// rect(range.x, range.y, range.width * 2, range.height * 2);
	let range = new Circle(mouseX, mouseY, qtreeLookupRadius);
	ellipse(range.x, range.y, qtreeLookupRadius * 2);
	let points = quadTree.query(range);
	for (let p of points) {
		strokeWeight(8);
		point(p.position.x, p.position.y);
	}
}

function showFrameRate() {
	let counter = document.getElementById('fps_counter');
	if (showFPS) {
		counter.style.display = 'flex';
		counter.innerHTML = 'FPS: ' + Math.floor(frameRate());
	} else {
		counter.style.display = 'none';
	}
}
