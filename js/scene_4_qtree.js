class Rectangle {
	constructor(x, y, width, height) {
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
	}

	contains(particle) {
		return particle.position.x > this.x - this.width && particle.position.x < this.x + this.width && particle.position.y > this.y - this.height && particle.position.y < this.y + this.height;
	}

	intersects(range) {
		return !(range.x - range.w > this.x + this.w || range.x + range.w < this.x - this.w || range.y - range.h > this.y + this.h || range.y + range.h < this.y - this.h);
	}
}

class Circle {
	constructor(x, y, r) {
		this.x = x;
		this.y = y;
		this.r = r;
		this.rSquared = this.r * this.r;
	}

	contains(particle) {
		let d = Math.pow(particle.position.x - this.x, 2) + Math.pow(particle.position.y - this.y, 2);
		return d <= this.rSquared;
	}

	intersects(range) {
		var xDist = Math.abs(range.x - this.x);
		var yDist = Math.abs(range.y - this.y);

		// radius of the circle
		var r = this.r;

		var w = range.w;
		var h = range.h;

		var edges = Math.pow(xDist - w, 2) + Math.pow(yDist - h, 2);

		// no intersection
		if (xDist > r + w || yDist > r + h) return false;

		// intersection within the circle
		if (xDist <= w || yDist <= h) return true;

		// intersection on the edge of the circle
		return edges <= this.rSquared;
	}
}

class QuadTree {
	constructor(bounds, capacity) {
		this.bounds = bounds;
		this.capacity = capacity;
		this.particles = [];
		this.divided = false;
	}

	subdivide() {
		let x = this.bounds.x;
		let y = this.bounds.y;
		let w = this.bounds.width;
		let h = this.bounds.height;

		let nw = new Rectangle(x - w / 2, y - h / 2, w / 2, h / 2);
		this.northWest = new QuadTree(nw, this.capacity);
		let ne = new Rectangle(x + w / 2, y - h / 2, w / 2, h / 2);
		this.northEast = new QuadTree(ne, this.capacity);
		let sw = new Rectangle(x - w / 2, y + h / 2, w / 2, h / 2);
		this.southWest = new QuadTree(sw, this.capacity);
		let se = new Rectangle(x + w / 2, y + h / 2, w / 2, h / 2);
		this.southEast = new QuadTree(se, this.capacity);

		this.divided = true;
	}

	insert(particle) {
		if (!this.bounds.contains(particle)) {
			return false;
		}

		if (this.particles.length < this.capacity) {
			this.particles.push(particle);
			return true;
		} else {
			if (!this.divided) {
				this.subdivide();
			}
			if (this.northWest.insert(particle)) {
				return true;
			} else if (this.northEast.insert(particle)) {
				return true;
			} else if (this.southWest.insert(particle)) {
				return true;
			} else if (this.southEast.insert(particle)) {
				return true;
			}
		}
	}

	query(range, found) {
		if (!found) {
			found = [];
		}
		if (!this.bounds.intersects(range)) {
			return;
		} else {
			for (let p of this.particles) {
				if (range.contains(p)) {
					found.push(p);
				}
			}
			if (this.divided) {
				this.northWest.query(range, found);
				this.northEast.query(range, found);
				this.southWest.query(range, found);
				this.southEast.query(range, found);
			}
		}
		return found;
	}

	showQuadtree() {
		stroke('rgba(0, 0, 0, 0.2)');
		strokeWeight(1);
		noFill();
		rectMode(CENTER);
		rect(this.bounds.x, this.bounds.y, this.bounds.width * 2, this.bounds.height * 2);
		if (this.divided) {
			this.northWest.showQuadtree();
			this.northEast.showQuadtree();
			this.southWest.showQuadtree();
			this.southEast.showQuadtree();
		}
	}
}
