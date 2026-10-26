/* Qi on the web: the entry point. Loads the games, then the optional parts, then starts. */
import { start } from './main.js?v=4';
import { openFromHash } from './online-ui.js?v=4';
import './scene3d.js?v=4';
import './mahjong-ui.js?v=4';

start();
openFromHash();
