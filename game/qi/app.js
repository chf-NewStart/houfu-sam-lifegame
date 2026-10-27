/* Qi on the web: the entry point. Loads the games, then the optional parts, then starts. */
import { start } from './main.js?v=13';
import { openFromHash } from './online-ui.js?v=13';
import './scene3d.js?v=13';
import './mahjong-ui.js?v=13';

start();
openFromHash();
