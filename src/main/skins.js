'use strict';

/* Skin catalogue: every entry pairs the awake atlas with its closed-eye twin,
 * which is also used for blinking. */
const SKINS = [
  {
    id: 'red',
    name: '赤狐',
    desc: '最经典的橙红色小狐狸',
    atlas: '/assets/textures/fox.png',
    sleep: '/assets/textures/fox_sleep.png',
    accent: '#e8823a',
  },
  {
    id: 'snow',
    name: '雪狐',
    desc: '雪原里来的白狐狸',
    atlas: '/assets/textures/fox_snow.png',
    sleep: '/assets/textures/fox_snow_sleep.png',
    accent: '#b9d3d8',
  },
  {
    id: 'red_baby',
    name: '赤狐幼崽',
    desc: '大头短腿的小赤狐',
    atlas: '/assets/textures/cub_red.png',
    sleep: '/assets/textures/cub_red_sleep.png',
    accent: '#f0a35f',
    model: 'pup',
    scale: 0.85,
  },
  {
    id: 'snow_baby',
    name: '雪狐幼崽',
    desc: '大头短腿的小雪狐',
    atlas: '/assets/textures/cub_snow.png',
    sleep: '/assets/textures/cub_snow_sleep.png',
    accent: '#d8ebee',
    model: 'pup',
    scale: 0.85,
  },
];

function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

module.exports = { SKINS, skinById };
