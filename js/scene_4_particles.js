class Particle {
	constructor(x, y, palette, flockID) {
		this.x = x;
		this.y = y;
		this.position = createVector(this.x, this.y);
		this.velocity = p5.Vector.random2D();
		this.velocity.setMag(random(0.5, 2));
		this.acceleration = createVector();
		// this.maxForce = random(0.15, 0.6);
		this.maxSpeed = random(2.5, 4);

		this.palette = palette;
		this.color = this.palette[Math.floor(Math.random() * this.palette.length)];
		this.flockID = flockID;
		this.particleID;
		this.highlighted = false;
		this.transformed = false;
		this.history = [];
	}

	setIndex(id) {
		this.particleID = id;
	}

	seek(target) {
		let heading = p5.Vector.sub(target.position, this.position);
		heading.setMag(this.maxSpeed);
		let steering = p5.Vector.sub(heading, this.velocity);
		// steering.limit(this.maxForce);
		steering.limit(random(0.2, 0.3));
		this.acceleration.add(steering);
	}

	highlight(particles) {
		for (let other of particles) {
			let d = dist(this.position.x, this.position.y, other.position.x, other.position.y);
			if (other != this && d < particleSize && !other.highlighted && other.flockID != this.flockID && mouseMoving) {
				other.highlighted = true;
				setTimeout(function() {
					other.highlighted = false;
				}, 500);
			}
			if (other != this && other.highlighted && other.flockID === 'flock2') {
				captured.push(other);
				if (captured.length > 20) {
					captured.splice(0, 1);
				}
				if (flock2.length <= 2) {
					captured.push(this);
				}
			}
		}
	}

	transform() {
		this.transformed = true;
		this.palette = palette1;
		this.color = this.palette[Math.floor(Math.random() * this.palette.length)];
		this.flockID = 'flock1';
	}

	align(particles) {
		let steering = createVector();
		let totalSeen = 0;
		for (let other of particles) {
			let d = dist(this.position.x, this.position.y, other.position.x, other.position.y);
			if (other != this && d < alignmentRadius && other.flockID === this.flockID) {
				steering.add(other.velocity);
				totalSeen++;
			}
		}
		if (totalSeen > 0) {
			steering.div(totalSeen);
			steering.setMag(this.maxSpeed);
			steering.sub(this.velocity);
			// steering.limit(this.maxForce);
			steering.limit(random(0.1, 0.2));
		}
		return steering;
	}

	cohere(particles) {
		let steering = createVector();
		let totalSeen = 0;
		for (let other of particles) {
			let d = dist(this.position.x, this.position.y, other.position.x, other.position.y);
			if (other != this && d < cohesionRadius && other.flockID === this.flockID) {
				steering.add(other.position);
				totalSeen++;
			}
		}
		if (totalSeen > 0) {
			steering.div(totalSeen);
			steering.sub(this.position);
			steering.setMag(this.maxSpeed);
			steering.sub(this.velocity);
			// steering.limit(this.maxForce);
			steering.limit(random(0.2, 0.4));
		}
		return steering;
	}

	separate(particles) {
		let steering = createVector();
		let totalSeen = 0;
		for (let other of particles) {
			let d = dist(this.position.x, this.position.y, other.position.x, other.position.y);
			if (other != this && d < avoidanceRadius && other.flockID === this.flockID) {
				let diff = p5.Vector.sub(this.position, other.position);
				diff.div(d * d);
				steering.add(diff);
				totalSeen++;
			}
		}
		if (totalSeen > 0) {
			steering.div(totalSeen);
			steering.setMag(this.maxSpeed);
			steering.sub(this.velocity);
			// steering.limit(this.maxForce);
			steering.limit(random(0.5, 0.7));
		}
		return steering;
	}

	flock(particles) {
		//add vector forces to flock
		let alignment = this.align(particles);
		let cohesion = this.cohere(particles);
		let separation = this.separate(particles);
		this.acceleration.add(alignment);
		this.acceleration.add(cohesion);
		this.acceleration.add(separation);
	}

	update() {
		//jitter particles
		this.position.x = this.position.x + random(-jitterDist, jitterDist);
		this.position.y = this.position.y + random(-jitterDist, jitterDist);
		// animate particles along vectors
		this.position.add(this.velocity);
		this.velocity.add(this.acceleration);
		this.velocity.limit(this.maxSpeed);
		// reset acceleration vector each frame
		this.acceleration.mult(0);
		// cache positions for trails
		let v = createVector(this.position.x, this.position.y);
		this.history.push(v);
		if (this.history.length > trailLength) {
			this.history.splice(0, 1);
		}
		// loop particles back through the opposite edge
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
		// regular view
		if (!showDebugView) {
			// highlights
			if (this.highlighted) {
				for (let i = 0; i < this.history.length / 2; i++) {
					let pos = this.history[i];
					let highlight = color('#F8C800');
					noStroke();
					highlight.setAlpha(i * (255 / (trailLength / 2)));
					fill(highlight);
					ellipse(pos.x + random(-3, +3), pos.y + random(-3, +3), particleVisualSize * 1.3);
				}
			}
			// trails (dither effect)
			for (let i = 0; i < this.history.length; i++) {
				let pos = this.history[i];
				let pColor = color(this.color);
				noStroke();
				pColor.setAlpha(i * (255 / trailLength));
				fill(pColor);
				ellipse(pos.x, pos.y, particleVisualSize);
			}
		}
		// debug view
		if (showDebugView) {
			stroke(this.color);
			strokeWeight(2.5);
			noFill();
			ellipse(this.position.x, this.position.y, particleSize);
			stroke(this.color);
			strokeWeight(0.5);
			noFill();
			ellipse(this.position.x, this.position.y, cohesionRadius * 2);
			stroke(this.color);
			strokeWeight(1.25);
			noFill();
			ellipse(this.position.x, this.position.y, alignmentRadius * 2);
			stroke(80);
			strokeWeight(0.75);
			noFill();
			ellipse(this.position.x, this.position.y, avoidanceRadius * 2);
		}
	}
}
