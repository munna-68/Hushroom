// Academic library corridor behind the study door, molded door casing & jambs,
// and classic 6-panel solid wood study door with architectural brass hardware.
import * as THREE from 'three';
import { EnvBuilder } from './envGeo';
import { patchLighting, PENDANT_LAMP } from './envMaterial';
import { DOOR, WALL_Z } from './hall';
import { cyl, roundedBox, sphere } from './toon';

// ============================================================================
// COLOR PALETTE
// ============================================================================
const OAK_FLOOR = '#8c5832';
const OAK_FLOOR_DARK = '#6e4224';
const DOOR_WOOD = '#6e4224';
const DOOR_DARK = '#583218';
const PANEL_RAISED = '#834e2b';
const PLASTER_WALL = '#f3e3c6';
const CEILING_COLOR = '#e8dcce';
const BRASS = '#d9a14a';
const DARK_IRON = '#26211d';
const SCONCE_GLASS = '#fff0c8';
const RUG_FRINGE = '#eadbc2';

// ============================================================================
// 1. PROCEDURAL CANVAS TEXTURE GENERATORS
// ============================================================================

/**
 * Generates the cozy vintage patterned hallway runner rug (terracotta, deep teal, cream, mustard).
 */
export function createVintageRunnerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Base terracotta field
  ctx.fillStyle = '#9e432e';
  ctx.fillRect(0, 0, 1024, 512);

  // Outer deep teal guard border
  ctx.strokeStyle = '#1d4d4f';
  ctx.lineWidth = 36;
  ctx.strokeRect(24, 24, 1024 - 48, 512 - 48);

  // Warm cream inner frame border
  ctx.strokeStyle = '#efe2c8';
  ctx.lineWidth = 22;
  ctx.strokeRect(58, 58, 1024 - 116, 512 - 116);

  // Mustard gold hairline
  ctx.strokeStyle = '#d49b4b';
  ctx.lineWidth = 4;
  ctx.strokeRect(76, 76, 1024 - 152, 512 - 152);

  // Geometric diamond chevrons along top and bottom cream bands
  ctx.fillStyle = '#1d4d4f';
  for (let x = 80; x < 944; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 58);
    ctx.lineTo(x + 8, 50);
    ctx.lineTo(x + 16, 58);
    ctx.lineTo(x + 8, 66);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, 512 - 58);
    ctx.lineTo(x + 8, 512 - 50);
    ctx.lineTo(x + 16, 512 - 58);
    ctx.lineTo(x + 8, 512 - 66);
    ctx.closePath();
    ctx.fill();
  }

  // Repeated vintage medallions down the runner length
  const centers = [210, 412, 612, 814];
  centers.forEach((cx, idx) => {
    const cy = 256;

    // Outer stepped diamond in deep teal
    ctx.fillStyle = '#1b494b';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 115);
    ctx.lineTo(cx + 85, cy);
    ctx.lineTo(cx, cy + 115);
    ctx.lineTo(cx - 85, cy);
    ctx.closePath();
    ctx.fill();

    // Inner warm cream diamond
    ctx.fillStyle = '#f2e5cb';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 82);
    ctx.lineTo(cx + 58, cy);
    ctx.lineTo(cx, cy + 82);
    ctx.lineTo(cx - 58, cy);
    ctx.closePath();
    ctx.fill();

    // Terracotta & ochre floral star center
    ctx.fillStyle = idx % 2 === 0 ? '#b34b34' : '#c98838';
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1d4d4f';
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();

    // Corner botanical flourishes
    ctx.fillStyle = '#efe2c8';
    [[-70, -95], [70, -95], [-70, 95], [70, 95]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, 7, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // Subtle woven fabric noise overlay
  ctx.fillStyle = 'rgba(255, 245, 225, 0.045)';
  for (let y = 0; y < 512; y += 4) {
    ctx.fillRect(0, y, 1024, 1.5);
  }
  ctx.fillStyle = 'rgba(30, 15, 8, 0.05)';
  for (let x = 0; x < 1024; x += 4) {
    ctx.fillRect(x, 0, 1.5, 512);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/**
 * Generates Vintage Botanical Prints:
 * Variant 0: "Dryopteris Filix-Mas" (Woodland Fern)
 * Variant 1: "Ginkgo Biloba Autumnalis" (Pressed Ginkgo)
 */
export function createBotanicalPrintTexture(variant = 0): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Cream passepartout matboard
  ctx.fillStyle = '#efe5d0';
  ctx.fillRect(0, 0, 512, 640);

  // Inner bevel mat line
  ctx.strokeStyle = '#b99f78';
  ctx.lineWidth = 4;
  ctx.strokeRect(48, 52, 416, 536);

  // Aged parchment botanical plate background
  ctx.fillStyle = '#f6edd9';
  ctx.fillRect(54, 58, 404, 524);

  ctx.save();
  ctx.translate(256, 480);

  if (variant === 0) {
    // Woodland Fern Frond illustration
    ctx.strokeStyle = '#2d4c2b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.quadraticCurveTo(-12, -160, 8, -350);
    ctx.stroke();

    // Pinnae (fern leaflets)
    for (let i = 0; i < 16; i++) {
      const t = i / 16;
      const y = -30 - t * 300;
      const reach = (1 - t * 0.72) * 115;

      [-1, 1].forEach((dir) => {
        ctx.fillStyle = i % 2 === 0 ? '#3a5f32' : '#4a703b';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(dir * reach * 0.5, y - 18, dir * reach, y - 8);
        ctx.quadraticCurveTo(dir * reach * 0.55, y + 8, 0, y + 6);
        ctx.closePath();
        ctx.fill();
      });
    }
  } else {
    // Pressed Ginkgo & Gold Berry specimen
    ctx.strokeStyle = '#5c4328';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(-10, 15);
    ctx.quadraticCurveTo(15, -150, -5, -330);
    ctx.stroke();

    const leaves = [
      { x: -55, y: -110, rot: -0.45, s: 1.0 },
      { x: 60, y: -155, rot: 0.42, s: 0.95 },
      { x: -50, y: -225, rot: -0.35, s: 0.85 },
      { x: 48, y: -275, rot: 0.3, s: 0.78 },
      { x: 0, y: -335, rot: 0.05, s: 0.7 },
    ];
    leaves.forEach((lf) => {
      ctx.save();
      ctx.translate(lf.x, lf.y);
      ctx.rotate(lf.rot);
      ctx.scale(lf.s, lf.s);
      ctx.fillStyle = '#c88d32';
      ctx.beginPath();
      ctx.moveTo(0, 25);
      ctx.lineTo(-42, -22);
      ctx.arc(0, -22, 42, Math.PI, 0, false);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }
  ctx.restore();

  // Latin classification typography
  ctx.fillStyle = '#4a3b2c';
  ctx.font = 'italic 18px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    variant === 0 ? 'Fig. I — Dryopteris Filix-Mas' : 'Fig. II — Ginkgo Biloba Autumnalis',
    256,
    545,
  );

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/**
 * Generates the textured Library Notice Board with pinned academic cards, notes, and push-pins.
 */
export function createNoticeBoardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 440;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Warm corkboard base
  ctx.fillStyle = '#9a683c';
  ctx.fillRect(0, 0, 640, 440);

  // Cork speckles
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(65, 38, 15, 0.25)' : 'rgba(218, 172, 118, 0.2)';
    const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * 640;
    const y = (Math.cos(i * 47.3) * 0.5 + 0.5) * 440;
    ctx.fillRect(x, y, 3, 3);
  }

  // Pinned paper notices
  const cards = [
    { x: 45, y: 40, w: 165, h: 210, rot: -0.04, bg: '#f7eed7', title: 'ARCHIVE HOURS', pin: '#c94038' },
    { x: 235, y: 35, w: 195, h: 165, rot: 0.03, bg: '#efe2c2', title: 'BOTANICAL LECTURE', pin: '#2e6f6d' },
    { x: 455, y: 50, w: 140, h: 190, rot: -0.03, bg: '#f4e8ce', title: 'FLOOR PLAN', pin: '#d49b38' },
    { x: 115, y: 235, w: 210, h: 155, rot: 0.02, bg: '#f9f1de', title: 'HERBARIUM NOTES', pin: '#c94038' },
    { x: 355, y: 225, w: 175, h: 165, rot: -0.05, bg: '#ead9b5', title: 'READING LIST', pin: '#2e6f6d' },
  ];

  cards.forEach((c) => {
    ctx.save();
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
    ctx.rotate(c.rot);

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-c.w / 2 + 4, -c.h / 2 + 5, c.w, c.h);

    // Paper
    ctx.fillStyle = c.bg;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);

    // Header text
    ctx.fillStyle = '#3b2b1d';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.fillText(c.title, -c.w / 2 + 14, -c.h / 2 + 28);

    // Ruled handwriting lines
    ctx.strokeStyle = 'rgba(75, 55, 38, 0.45)';
    ctx.lineWidth = 2;
    for (let l = 0; l < 6; l++) {
      const ly = -c.h / 2 + 48 + l * 18;
      if (ly < c.h / 2 - 16) {
        ctx.beginPath();
        ctx.moveTo(-c.w / 2 + 14, ly);
        ctx.lineTo(c.w / 2 - 18 - (l % 3) * 20, ly);
        ctx.stroke();
      }
    }

    // Brass / enamel push-pin
    ctx.fillStyle = c.pin;
    ctx.beginPath();
    ctx.arc(0, -c.h / 2 + 11, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ============================================================================
// 2. DOOR CASING, JAMBS & THRESHOLD
// ============================================================================

/**
 * Builds the molded door casing, vertical jambs, crowned lintel pediment header trim,
 * stop rabbet strips, brass strike plate, and raised wooden threshold with brass wear-strip.
 */
export function buildDoorCasing(b: EnvBuilder) {
  const x0 = DOOR.x - DOOR.w / 2;
  const x1 = DOOR.x + DOOR.w / 2;
  const wallThick = 0.22;
  const wallMidZ = WALL_Z - wallThick / 2; // -5.31
  const jambThick = 0.032;
  const jambDepth = wallThick + 0.02;

  // 1. Vertical Door Jambs lining the opening
  b.add(new THREE.BoxGeometry(jambThick, DOOR.h, jambDepth), DOOR_DARK, {
    p: [x0 + jambThick / 2, DOOR.h / 2, wallMidZ],
  });
  b.add(new THREE.BoxGeometry(jambThick, DOOR.h, jambDepth), DOOR_DARK, {
    p: [x1 - jambThick / 2, DOOR.h / 2, wallMidZ],
  });

  // Top head jamb
  b.add(new THREE.BoxGeometry(DOOR.w, jambThick, jambDepth), DOOR_DARK, {
    p: [DOOR.x, DOOR.h - jambThick / 2, wallMidZ],
  });

  // 2. Plinth blocks & fluted vertical casing molding (both Study and Corridor faces)
  const zFaces = [WALL_Z + 0.016, WALL_Z - wallThick - 0.016];
  for (const zf of zFaces) {
    for (const side of [-1, 1]) {
      const px = DOOR.x + side * (DOOR.w / 2 + 0.04);
      // Plinth block at base
      b.add(roundedBox(0.12, 0.22, 0.036, 0.006, 1), DOOR_DARK, {
        p: [px, 0.11, zf],
      });
      // Fluted vertical casing molding above plinth
      const casingH = DOOR.h - 0.22 + 0.04;
      b.add(roundedBox(0.105, casingH, 0.028, 0.005, 1), DOOR_DARK, {
        p: [px, 0.22 + casingH / 2, zf],
      });
    }

    // Crowned lintel pediment header trim above door
    b.add(roundedBox(DOOR.w + 0.28, 0.11, 0.034, 0.006, 1), DOOR_DARK, {
      p: [DOOR.x, DOOR.h + 0.055, zf],
    });
    const zCap = zf + (zf > wallMidZ ? 0.008 : -0.008);
    b.add(roundedBox(DOOR.w + 0.34, 0.035, 0.052, 0.006, 1), DOOR_DARK, {
      p: [DOOR.x, DOOR.h + 0.12, zCap],
    });
  }

  // 3. Inner Door Stop Rabbet Strips along jamb interior
  b.add(new THREE.BoxGeometry(0.014, DOOR.h - 0.04, 0.035), DOOR_DARK, {
    p: [x0 + jambThick + 0.007, DOOR.h / 2, wallMidZ + 0.01],
  });
  b.add(new THREE.BoxGeometry(0.014, DOOR.h - 0.04, 0.035), DOOR_DARK, {
    p: [x1 - jambThick - 0.007, DOOR.h / 2, wallMidZ + 0.01],
  });

  // Brass strike plate on lock jamb
  b.add(new THREE.BoxGeometry(0.006, 0.11, 0.032), BRASS, {
    p: [x1 - jambThick - 0.001, 1.025, wallMidZ + 0.04],
  });

  // 4. Slightly Raised Wooden Threshold on the Floor
  b.add(roundedBox(DOOR.w - 0.02, 0.024, wallThick + 0.06, 0.004, 1), DOOR_DARK, {
    p: [DOOR.x, 0.012, wallMidZ],
  });
  // Aged brass wear-strip inlay
  b.add(new THREE.BoxGeometry(DOOR.w - 0.06, 0.026, 0.028), BRASS, {
    p: [DOOR.x, 0.013, wallMidZ + 0.04],
  });
}

// ============================================================================
// 3. CLASSIC 6-PANEL STUDY DOOR WITH ARCHITECTURAL BRASS HARDWARE
// ============================================================================

export interface BuiltDoor {
  doorGeo: THREE.BufferGeometry;
  leverGroup: THREE.Group;
}

/**
 * Builds the classic 6-panel solid wood study door with stiles, rails, center mullion,
 * 6 raised beveled panels, 3 architectural barrel hinges, backplates, keyhole, and rotating lever.
 */
export function buildDoor(): BuiltDoor {
  const b = new EnvBuilder();
  const w = DOOR.w - 0.04; // 1.02m clear leaf width
  const h = DOOR.h - 0.03; // 2.23m clear leaf height
  const doorD = 0.046;     // 46mm thickness

  // 1. Stiles (Left hinge stile and Right lock stile)
  const stileW = 0.13;
  b.add(new THREE.BoxGeometry(stileW, h, doorD), DOOR_WOOD, {
    p: [stileW / 2, h / 2, 0],
  });
  b.add(new THREE.BoxGeometry(stileW, h, doorD), DOOR_WOOD, {
    p: [w - stileW / 2, h / 2, 0],
  });

  // Center vertical mullion
  const mullionW = 0.10;
  b.add(new THREE.BoxGeometry(mullionW, h - 0.24, doorD * 0.96), DOOR_WOOD, {
    p: [w / 2, h / 2, 0],
  });

  // 2. Horizontal Rails
  // Bottom kick rail
  b.add(new THREE.BoxGeometry(w - stileW * 1.9, 0.24, doorD * 0.98), DOOR_WOOD, {
    p: [w / 2, 0.12, 0],
  });
  // Middle lock rail
  b.add(new THREE.BoxGeometry(w - stileW * 1.9, 0.16, doorD * 0.98), DOOR_WOOD, {
    p: [w / 2, 1.00, 0],
  });
  // Upper cross rail / frieze rail
  b.add(new THREE.BoxGeometry(w - stileW * 1.9, 0.11, doorD * 0.98), DOOR_WOOD, {
    p: [w / 2, 1.62, 0],
  });
  // Top rail
  b.add(new THREE.BoxGeometry(w - stileW * 1.9, 0.14, doorD * 0.98), DOOR_WOOD, {
    p: [w / 2, h - 0.07, 0],
  });

  // Recessed inner core web
  b.add(new THREE.BoxGeometry(w - 0.06, h - 0.06, doorD * 0.45), DOOR_DARK, {
    p: [w / 2, h / 2, 0],
  });

  // 3. Six Raised Beveled Panels (3 rows x 2 columns)
  const colLeft = (stileW + (w / 2 - mullionW / 2)) / 2;
  const colRight = ((w / 2 + mullionW / 2) + (w - stileW)) / 2;
  const panelCols = [colLeft, colRight];
  const panelW = 0.29;

  const panelRows = [
    { y: 0.56, h: 0.52 }, // Lower panels
    { y: 1.34, h: 0.43 }, // Middle panels
    { y: 1.91, h: 0.35 }, // Top panels
  ];

  for (const row of panelRows) {
    for (const colX of panelCols) {
      // Outer bevel border
      b.add(roundedBox(panelW, row.h, doorD * 0.72, 0.01, 1), DOOR_DARK, {
        p: [colX, row.y, 0],
      });
      // Raised center fielding
      b.add(roundedBox(panelW - 0.05, row.h - 0.05, doorD * 0.92, 0.008, 1), PANEL_RAISED, {
        p: [colX, row.y, 0],
      });
    }
  }

  // 4. Architectural Brass Barrel Hinges (3 hinges on left stile)
  const hingeYs = [0.35, 1.12, 1.95];
  for (const hy of hingeYs) {
    // Barrel knuckle on hinge axis
    b.add(cyl(0.011, 0.011, 0.11, 14), BRASS, {
      p: [0, hy, -doorD / 2 - 0.004],
    });
    // Top & bottom spherical finial caps
    b.add(sphere(0.012, 10, 8), BRASS, {
      p: [0, hy + 0.06, -doorD / 2 - 0.004],
    });
    b.add(sphere(0.012, 10, 8), BRASS, {
      p: [0, hy - 0.06, -doorD / 2 - 0.004],
    });
    // Leaf plate bolted to door edge
    b.add(new THREE.BoxGeometry(0.032, 0.10, 0.005), BRASS, {
      p: [0.018, hy, -doorD / 2 - 0.002],
    });
    // Screw heads
    for (const sy of [-0.032, 0, 0.032]) {
      b.add(cyl(0.0035, 0.0035, 0.004, 6), DARK_IRON, {
        p: [0.022, hy + sy, -doorD / 2],
        r: [Math.PI / 2, 0, 0],
      });
    }
  }

  // 5. Escutcheon Backplates, Keyholes & Latch Bolt
  const lockX = w - 0.075;
  const lockY = 1.00;

  for (const zSide of [-1, 1]) {
    const zf = zSide * (doorD / 2 + 0.004);
    // Chamfered brass backplate
    b.add(roundedBox(0.048, 0.21, 0.008, 0.003, 1), BRASS, {
      p: [lockX, lockY, zf],
    });
    // Keyhole slot
    b.add(new THREE.BoxGeometry(0.011, 0.024, 0.01), DARK_IRON, {
      p: [lockX, lockY - 0.055, zf],
    });
  }

  // Brass latch bolt on door lock edge
  b.add(new THREE.BoxGeometry(0.016, 0.026, 0.016), BRASS, {
    p: [w + 0.006, lockY + 0.025, 0],
  });

  // 6. Rotating Lever Handle Assembly
  const leverGroup = new THREE.Group();
  leverGroup.position.set(lockX, lockY + 0.025, 0);

  const spindleMesh = new THREE.Mesh(
    cyl(0.011, 0.011, doorD + 0.06, 12),
    new THREE.MeshLambertMaterial({ color: BRASS }),
  );
  spindleMesh.rotation.x = Math.PI / 2;
  leverGroup.add(spindleMesh);

  for (const zSide of [-1, 1]) {
    const neck = new THREE.Mesh(
      cyl(0.01, 0.013, 0.042, 12),
      new THREE.MeshLambertMaterial({ color: BRASS }),
    );
    neck.rotation.x = Math.PI / 2;
    neck.position.set(0, 0, zSide * (doorD / 2 + 0.025));
    leverGroup.add(neck);

    const grip = new THREE.Mesh(
      cyl(0.009, 0.012, 0.125, 12),
      new THREE.MeshLambertMaterial({ color: BRASS }),
    );
    grip.rotation.z = Math.PI / 2;
    grip.position.set(-0.052, 0, zSide * (doorD / 2 + 0.046));
    leverGroup.add(grip);

    const tip = new THREE.Mesh(
      sphere(0.013, 12, 10),
      new THREE.MeshLambertMaterial({ color: BRASS }),
    );
    tip.position.set(-0.115, 0, zSide * (doorD / 2 + 0.046));
    leverGroup.add(tip);
  }

  return {
    doorGeo: b.build(),
    leverGroup,
  };
}

// ============================================================================
// 4. HALLWAY CORRIDOR SCENE ARCHITECTURE
// ============================================================================

/**
 * Builds the warm Studio Ghibli / academic library corridor behind the door:
 * - Oak floor and vintage patterned runner rug with fringes
 * - Cream plaster walls with wainscot panels, chair rails, baseboards, and crown molding
 * - Ceiling with exposed dark oak cross beams
 * - Left and right arched doorways framing the lobby bay
 * - Distant mullioned window spilling golden light on the left
 * - Distant library bookcase loaded with colorful volumes on the right
 * - Console table with stacked books and celadon vase with golden sprigs
 * - Botanical prints (Woodland Fern, Ginkgo) and framed library notice board
 * - Glowing warm brass wall sconces / lanterns
 */
export function buildHallwayCorridor(b: EnvBuilder, group: THREE.Group) {
  const wallThick = 0.22;
  const Z_FRONT = WALL_Z - wallThick; // -5.42 (door wall back face)
  const Z_BACK = -7.65;               // corridor back wall
  const DEPTH = -Z_FRONT + Z_BACK < 0 ? -(Z_FRONT - Z_BACK) : Z_FRONT - Z_BACK; // 2.23m
  const Z_MID = (Z_FRONT + Z_BACK) / 2; // -6.535
  const Y_CEIL = 3.20;

  const X_MIN = -1.2;
  const X_MAX = 6.2;
  const W = X_MAX - X_MIN; // 7.4m
  const X_CENTER = (X_MIN + X_MAX) / 2; // 2.50

  const x0 = DOOR.x - DOOR.w / 2; // 2.02
  const x1 = DOOR.x + DOOR.w / 2; // 3.08

  // --- A. Floor & Ceiling ---
  // Oak floor slab
  b.add(new THREE.BoxGeometry(W + 0.2, 0.06, DEPTH + 0.08), OAK_FLOOR, {
    p: [X_CENTER, -0.03, Z_MID],
  });
  // Dark oak plank borders along floor edges
  b.add(new THREE.BoxGeometry(W + 0.2, 0.01, 0.08), OAK_FLOOR_DARK, {
    p: [X_CENTER, 0.005, Z_FRONT - 0.04],
  });
  b.add(new THREE.BoxGeometry(W + 0.2, 0.01, 0.08), OAK_FLOOR_DARK, {
    p: [X_CENTER, 0.005, Z_BACK + 0.04],
  });

  // Soft cream plaster ceiling
  b.add(new THREE.BoxGeometry(W + 0.2, 0.06, DEPTH + 0.08), CEILING_COLOR, {
    p: [X_CENTER, Y_CEIL + 0.03, Z_MID],
  });

  // Exposed wooden ceiling beams spanning across the corridor along Z
  const beamXs = [-0.6, 0.95, 2.50, 4.05, 5.60];
  for (const bx of beamXs) {
    b.add(new THREE.BoxGeometry(0.14, 0.16, DEPTH + 0.04), DOOR_DARK, {
      p: [bx, Y_CEIL - 0.08, Z_MID],
    });
  }

  // --- B. Opposite Hallway Back Wall & Architectural Trim ---
  // Main back wall slab
  b.add(new THREE.BoxGeometry(W + 0.2, Y_CEIL, 0.16), PLASTER_WALL, {
    p: [X_CENTER, Y_CEIL / 2, Z_BACK - 0.08],
  });
  // Full-length baseboard along back wall
  b.add(roundedBox(W + 0.2, 0.18, 0.03, 0.006, 1), DOOR_DARK, {
    p: [X_CENTER, 0.09, Z_BACK + 0.015],
  });
  // Chair rail / dado moulding at y = 0.96m
  b.add(roundedBox(W + 0.2, 0.055, 0.035, 0.008, 1), DOOR_WOOD, {
    p: [X_CENTER, 0.96, Z_BACK + 0.018],
  });
  // Recessed wood wainscot panels along lower back wall
  for (let px = -0.8; px <= 5.8; px += 0.8) {
    b.add(roundedBox(0.68, 0.62, 0.018, 0.006, 1), PANEL_RAISED, {
      p: [px, 0.54, Z_BACK + 0.01],
    });
  }
  // Crown moulding along back ceiling line
  b.add(roundedBox(W + 0.2, 0.11, 0.06, 0.01, 1), DOOR_DARK, {
    p: [X_CENTER, Y_CEIL - 0.055, Z_BACK + 0.03],
  });

  // --- C. Doorway Wall Corridor Face (Front Hallway Wall at Z_FRONT) ---
  // Left wall segment (x: X_MIN to x0)
  const wLeft = x0 - X_MIN;
  const cxLeft = (X_MIN + x0) / 2;
  b.add(new THREE.BoxGeometry(wLeft, Y_CEIL, 0.08), PLASTER_WALL, {
    p: [cxLeft, Y_CEIL / 2, Z_FRONT + 0.04],
  });
  b.add(roundedBox(wLeft - 0.08, 0.18, 0.03, 0.006, 1), DOOR_DARK, {
    p: [cxLeft - 0.04, 0.09, Z_FRONT - 0.015],
  });
  b.add(roundedBox(wLeft - 0.08, 0.055, 0.032, 0.006, 1), DOOR_WOOD, {
    p: [cxLeft - 0.04, 0.96, Z_FRONT - 0.016],
  });

  // Right wall segment (x: x1 to X_MAX)
  const wRight = X_MAX - x1;
  const cxRight = (x1 + X_MAX) / 2;
  b.add(new THREE.BoxGeometry(wRight, Y_CEIL, 0.08), PLASTER_WALL, {
    p: [cxRight, Y_CEIL / 2, Z_FRONT + 0.04],
  });
  b.add(roundedBox(wRight - 0.08, 0.18, 0.03, 0.006, 1), DOOR_DARK, {
    p: [cxRight + 0.04, 0.09, Z_FRONT - 0.015],
  });
  b.add(roundedBox(wRight - 0.08, 0.055, 0.032, 0.006, 1), DOOR_WOOD, {
    p: [cxRight + 0.04, 0.96, Z_FRONT - 0.016],
  });

  // Header wall above doorway opening
  const headerH = Y_CEIL - DOOR.h;
  b.add(new THREE.BoxGeometry(DOOR.w, headerH, 0.08), PLASTER_WALL, {
    p: [DOOR.x, DOOR.h + headerH / 2, Z_FRONT + 0.04],
  });

  // Crown moulding along front ceiling line
  b.add(roundedBox(W + 0.2, 0.11, 0.06, 0.01, 1), DOOR_DARK, {
    p: [X_CENTER, Y_CEIL - 0.055, Z_FRONT - 0.03],
  });

  // --- D. Cross Archways (Left arch at x = 0.6, Right arch at x = 4.5) ---
  const archH = 2.38;
  const pilasterW = 0.22;
  const archXs = [0.6, 4.5];

  for (const archX of archXs) {
    // Front & Back pilasters
    b.add(new THREE.BoxGeometry(0.18, archH, pilasterW), DOOR_DARK, {
      p: [archX, archH / 2, Z_FRONT - pilasterW / 2],
    });
    b.add(new THREE.BoxGeometry(0.22, 0.08, pilasterW + 0.04), PANEL_RAISED, {
      p: [archX, archH + 0.04, Z_FRONT - pilasterW / 2],
    });

    b.add(new THREE.BoxGeometry(0.18, archH, pilasterW), DOOR_DARK, {
      p: [archX, archH / 2, Z_BACK + pilasterW / 2],
    });
    b.add(new THREE.BoxGeometry(0.22, 0.08, pilasterW + 0.04), PANEL_RAISED, {
      p: [archX, archH + 0.04, Z_BACK + pilasterW / 2],
    });

    // Spandrel header wall spanning across corridor
    const spandrelH = Y_CEIL - archH;
    b.add(new THREE.BoxGeometry(0.18, spandrelH, DEPTH), PLASTER_WALL, {
      p: [archX, archH + spandrelH / 2, Z_MID],
    });

    // Wooden arch soffit band
    b.add(new THREE.BoxGeometry(0.20, 0.08, DEPTH - 0.12), DOOR_DARK, {
      p: [archX, archH + 0.02, Z_MID],
    });

    // Decorative corner corbels
    b.add(new THREE.BoxGeometry(0.18, 0.24, 0.20), DOOR_WOOD, {
      p: [archX, archH - 0.12, Z_FRONT - 0.26],
      r: [0.35, 0, 0],
    });
    b.add(new THREE.BoxGeometry(0.18, 0.24, 0.20), DOOR_WOOD, {
      p: [archX, archH - 0.12, Z_BACK + 0.26],
      r: [-0.35, 0, 0],
    });
  }

  // --- E. Distant Corridor Ends ---
  // Left End Window (x = X_MIN)
  b.add(new THREE.BoxGeometry(0.16, Y_CEIL, DEPTH), PLASTER_WALL, {
    p: [X_MIN - 0.08, Y_CEIL / 2, Z_MID],
  });
  // Window frame & mullions
  b.add(roundedBox(0.06, 1.75, 1.35, 0.015, 1), DOOR_DARK, {
    p: [X_MIN + 0.02, 1.72, Z_MID],
  });
  b.add(new THREE.BoxGeometry(0.08, 1.70, 0.04), DOOR_DARK, {
    p: [X_MIN + 0.02, 1.72, Z_MID],
  });
  b.add(new THREE.BoxGeometry(0.08, 0.04, 1.30), DOOR_DARK, {
    p: [X_MIN + 0.02, 1.72, Z_MID],
  });
  // Glowing amber window pane (illuminates down corridor)
  b.add(new THREE.PlaneGeometry(1.28, 1.68), '#fff3d6', {
    p: [X_MIN + 0.04, 1.72, Z_MID],
    r: [0, Math.PI / 2, 0],
  }, { emit: PENDANT_LAMP, glow: 1.8 });

  // Right End Distant Bookcase (x = X_MAX)
  b.add(new THREE.BoxGeometry(0.16, Y_CEIL, DEPTH), PLASTER_WALL, {
    p: [X_MAX + 0.08, Y_CEIL / 2, Z_MID],
  });
  b.add(roundedBox(0.35, 2.75, DEPTH - 0.14, 0.015, 1), DOOR_DARK, {
    p: [X_MAX - 0.18, 1.375, Z_MID],
  });
  // Rows of colorful books inside distant bookcase
  const bookPalette = ['#8c3328', '#2c594c', '#b87d2e', '#384b6b', '#6e4228', '#994a36'];
  for (let row = 0; row < 4; row++) {
    const sy = 0.42 + row * 0.58;
    for (let rz = -0.75; rz <= 0.75; rz += 0.12) {
      const bH = 0.32 + Math.sin(rz * 9 + row) * 0.05;
      const col = bookPalette[Math.abs(Math.round(rz * 25 + row * 3)) % bookPalette.length];
      b.add(new THREE.BoxGeometry(0.24, bH, 0.09), col, {
        p: [X_MAX - 0.22, sy + bH / 2, Z_MID + rz],
      });
    }
  }

  // --- F. Vintage Patterned Runner Rug with Fringes ---
  const rugL = 5.2;
  const rugW = 1.15;
  const rugTex = createVintageRunnerTexture();
  const rugMat = new THREE.MeshLambertMaterial({ map: rugTex });
  patchLighting(rugMat);

  const rugMesh = new THREE.Mesh(new THREE.PlaneGeometry(rugL, rugW), rugMat);
  rugMesh.rotation.x = -Math.PI / 2;
  rugMesh.position.set(2.55, 0.008, Z_MID);
  rugMesh.receiveShadow = true;
  group.add(rugMesh);

  // Tassel fringes at both ends of the runner rug
  for (const endSide of [-1, 1]) {
    const endX = 2.55 + endSide * (rugL / 2 + 0.035);
    for (let fz = -rugW / 2 + 0.04; fz <= rugW / 2 - 0.04; fz += 0.05) {
      b.add(new THREE.BoxGeometry(0.07, 0.006, 0.024), RUG_FRINGE, {
        p: [endX, 0.004, Z_MID + fz],
      });
    }
  }

  // --- G. Console Table / Credenza (x = 2.15, opposite the door) ---
  const tableX = 2.15;
  const tableZ = Z_BACK + 0.22;
  // Molded tabletop
  b.add(roundedBox(1.05, 0.04, 0.38, 0.008, 1), DOOR_WOOD, {
    p: [tableX, 0.78, tableZ],
  });
  // Apron with drawers
  b.add(new THREE.BoxGeometry(0.96, 0.11, 0.33), DOOR_DARK, {
    p: [tableX, 0.71, tableZ],
  });
  // Brass drawer knobs
  b.add(sphere(0.014, 10, 8), BRASS, {
    p: [tableX - 0.22, 0.71, tableZ + 0.175],
  });
  b.add(sphere(0.014, 10, 8), BRASS, {
    p: [tableX + 0.22, 0.71, tableZ + 0.175],
  });
  // 4 turned legs
  for (const dx of [-0.44, 0.44]) {
    for (const dz of [-0.13, 0.13]) {
      b.add(cyl(0.022, 0.015, 0.76, 10), DOOR_DARK, {
        p: [tableX + dx, 0.38, tableZ + dz],
      });
    }
  }
  // Lower shelf
  b.add(roundedBox(0.92, 0.022, 0.30, 0.004, 1), DOOR_WOOD, {
    p: [tableX, 0.18, tableZ],
  });

  // Stack of leather-bound library books on table
  const stackColors = ['#7c2d23', '#244c44', '#9c6b27'];
  stackColors.forEach((col, i) => {
    b.add(roundedBox(0.24 - i * 0.015, 0.042, 0.17 - i * 0.01, 0.004, 1), col, {
      p: [tableX - 0.24, 0.821 + i * 0.043, tableZ + 0.01],
      r: [0, (i - 1) * 0.12, 0],
    });
  });

  // Celadon ceramic vase with golden sprigs
  b.add(cyl(0.042, 0.068, 0.19, 14), '#6f8c7a', {
    p: [tableX + 0.24, 0.895, tableZ],
  });
  // Dried botanical sprigs
  const sprigAngles = [-0.18, 0, 0.20];
  sprigAngles.forEach((ang, idx) => {
    b.add(cyl(0.004, 0.004, 0.26, 6), '#c89141', {
      p: [tableX + 0.24 + (idx - 1) * 0.015, 1.04, tableZ],
      r: [0, 0, ang],
    });
  });

  // --- H. Framed Botanical Prints & Library Notice Board ---
  // 1. Botanical Prints (Left: Fern, Center-Left: Ginkgo)
  const prints = [
    { x: 1.15, y: 1.70, variant: 0 },
    { x: 1.68, y: 1.70, variant: 1 },
  ];
  for (const pr of prints) {
    // Molded wooden outer frame
    b.add(roundedBox(0.48, 0.62, 0.032, 0.006, 1), DOOR_DARK, {
      p: [pr.x, pr.y, Z_BACK + 0.016],
    });
    // Gold leaf fillet
    b.add(new THREE.BoxGeometry(0.41, 0.55, 0.034), BRASS, {
      p: [pr.x, pr.y, Z_BACK + 0.017],
    });

    // Art canvas plate
    const tex = createBotanicalPrintTexture(pr.variant);
    const artMat = new THREE.MeshLambertMaterial({ map: tex });
    patchLighting(artMat);
    const artMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.52), artMat);
    artMesh.position.set(pr.x, pr.y, Z_BACK + 0.036);
    group.add(artMesh);
  }

  // 2. Framed Library Notice Board (x = 3.25)
  const nbX = 3.25;
  const nbY = 1.70;
  // Wooden frame
  b.add(roundedBox(0.96, 0.68, 0.038, 0.006, 1), DOOR_DARK, {
    p: [nbX, nbY, Z_BACK + 0.019],
  });
  // Brass top plaque
  b.add(roundedBox(0.22, 0.032, 0.044, 0.004, 1), BRASS, {
    p: [nbX, nbY + 0.31, Z_BACK + 0.022],
  });

  // Corkboard canvas plate
  const corkTex = createNoticeBoardTexture();
  const corkMat = new THREE.MeshLambertMaterial({ map: corkTex });
  patchLighting(corkMat);
  const corkMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.58), corkMat);
  corkMesh.position.set(nbX, nbY, Z_BACK + 0.04);
  group.add(corkMesh);

  // --- I. Glowing Warm Brass Wall Sconces / Lanterns ---
  const sconceXs = [0.95, 2.50, 4.05];
  for (const sx of sconceXs) {
    const sy = 2.05;
    // Circular brass wall rosette backplate
    b.add(cyl(0.065, 0.072, 0.022, 16), BRASS, {
      p: [sx, sy, Z_BACK + 0.012],
      r: [Math.PI / 2, 0, 0],
    });
    // Curved swan-neck brass arm
    b.add(new THREE.BoxGeometry(0.022, 0.024, 0.14), BRASS, {
      p: [sx, sy - 0.02, Z_BACK + 0.08],
    });
    // Brass lantern cup
    b.add(cyl(0.055, 0.032, 0.04, 14), BRASS, {
      p: [sx, sy + 0.01, Z_BACK + 0.145],
    });
    // Glowing warm amber lantern glass globe
    b.add(cyl(0.068, 0.048, 0.15, 16), SCONCE_GLASS, {
      p: [sx, sy + 0.10, Z_BACK + 0.145],
    }, { emit: PENDANT_LAMP, glow: 2.5 });
    // Brass conical top cap
    b.add(new THREE.ConeGeometry(0.078, 0.045, 14), BRASS, {
      p: [sx, sy + 0.19, Z_BACK + 0.145],
    });
  }
}
