class Wanderer {
	constructor(x, y, controllable) {
		this.x = x;
		this.y = y;
		this.controllable = controllable;
		this.position = createVector(this.x, this.y);
		this.velocity = p5.Vector.random2D();
		this.velocity.setMag(3);
		this.maxSpeed = 6;
	}

	update() {
		if (this.controllable && mouseMoving) {
			// animate wanderer to chase mouse
			let mousePos = createVector(mouseX, mouseY);
			this.acceleration = p5.Vector.sub(mousePos, this.position);
			this.acceleration.setMag(8);
			this.velocity.add(this.acceleration);
			this.velocity.limit(12);
			this.position.add(this.velocity);
		} else {
			// animate wanderer along random vectors
			this.acceleration = p5.Vector.random2D();
			this.velocity.add(this.acceleration);
			this.velocity.limit(this.maxSpeed);
			this.position.add(this.velocity);
		}
		// loop wanderer back through the opposite edge
		if (this.position.x > width) {
			this.position.x = 0;
		} else if (this.position.x < 0) {
			this.position.x = width;
		}
		if (this.position.y > height) {
			this.position.y = 0;
		} else if (this.position.y < 0) {
			this.position.y = height;
		}
	}

	render() {
		// debug view
		if (showDebugView) {
			if (this.controllable && mouseMoving) {
				stroke(0, 255, 0);
			} else {
				stroke(255);
			}
			strokeWeight(5);
			noFill();
			ellipse(this.position.x, this.position.y, particleSize);
		}
	}
}
