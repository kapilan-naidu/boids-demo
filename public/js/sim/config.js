// Simulation constants and defaults.
// Distances are in world units: the world is always WORLD_HEIGHT tall and as wide as the
// window's aspect ratio requires. Speeds are units per second.

export const WORLD_HEIGHT = 720;
export const FLOCK_COUNT = 2;

export const TRAIL_SAMPLES = 16; // trail points kept per boid
export const TRAIL_INTERVAL = 1 / 30; // seconds between trail points
export const MAX_STEP = 1 / 30; // longest simulated step, in seconds
export const FLASH_TIME = 0.5; // seconds a contact highlight lasts

export const POINTER_HOLD = 0.6; // seconds a pointer stays active after its last update
export const MAX_AUDIENCE_POINTERS = 80;

// Where each flock starts, as fractions of the world.
export const FLOCK_ANCHORS = [
  { x: 0.75, y: 0.3 },
  { x: 0.25, y: 0.7 },
];

export const DEFAULT_PARAMS = {
  seed: 7,
  boidsPerFlock: 160,

  // Rule weights.
  separation: 1.8,
  alignment: 0.6,
  cohesion: 0.6,

  // Geometry. Alignment and cohesion look out to perceptionRadius; separation only
  // reacts inside perceptionRadius * separationRatio. Contact is where flocks meet.
  perceptionRadius: 80,
  separationRatio: 0.55,
  contactRadius: 26,

  // Motion. Boids ease towards a cruising speed, and are clamped between the two limits.
  maxSpeed: 170,
  minSpeed: 70,
  cruiseRatio: 0.8,
  maxForce: 340,
  // Random steering, as a fraction of maxForce. Stops flocks setting into a lattice.
  wander: 0.25,

  // Participation.
  pointerStrength: 1.2, // pointer pull, as a multiple of maxForce
  pointerSoftening: 60, // keeps the nearest-pointer weighting finite at close range
  // Chance per second that a boid touching the presenter's flock converts to it, while
  // the presenter holds Shift.
  conversionRate: 2.5,

  // The audience fight. A boid whose foes within fightRadius number more than
  // fightMargin times its friends converts, at up to fightRate chances per second (more
  // likely the worse the odds). A converted boid is then safe for fightCooldown seconds.
  fightRadius: 50,
  fightRate: 0.5,
  fightMargin: 1.5,
  fightCooldown: 5,
};
