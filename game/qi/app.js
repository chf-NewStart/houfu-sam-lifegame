/* Qi on the web: the entry point. Loads the games, then the optional parts, then starts. */
import { start } from './main.js?v=9';
import { openFromHash } from './online-ui.js?v=9';
import './scene3d.js?v=9';
import './mahjong-ui.js?v=9';

start();
openFromHash();
