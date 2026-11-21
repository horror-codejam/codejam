// Fixed logical stage. The canvas and the DOM overlay are both scaled to fit the window.
export const W = 1280;
export const H = 720;

// Every view is a "plate": a pre-rendered still in a 2:1 frame (the Blender cameras render 960 x 480).
// Plates are drawn larger than the stage so the camera can pan across them (the 2.5D look).
export const PLATE_W = 960;
export const PLATE_H = 480;
export const ZOOM = 1.12;
export const K = (H / PLATE_H) * ZOOM; // plate px -> stage px
export const PAN_X = (PLATE_W * K - W) / 2; // max horizontal pan, stage px
export const PAN_Y = (PLATE_H * K - H) / 2; // max vertical pan, stage px

// Areas of the desk render (scenes/03-watch-room/render_blockout_cam_desk.png), in plate px.
export const DESK_SCREEN = { x: 160, y: 266, w: 644, h: 188 }; // CHUD's terminal, slightly inset from the green panel
export const DESK_GLAZING = { x: 0, y: 0, w: 960, h: 216 }; // ocean-facing windows behind the desk
