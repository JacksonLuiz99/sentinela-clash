export const DEFAULT_CLAN = '#R0UPVVVY';
export const CLANS = Object.freeze([
  {
    "tag": "#2Y0P809CU",
    "name": "iTOW Gaming",
    "label": "iTOW"
  },
  {
    "tag": "#2YJLQRLYL",
    "name": "TIGERS CHAMPION",
    "label": "Tigers Champion"
  },
  {
    "tag": "#28L88PQ2",
    "name": "TIGERS OF WAR",
    "label": "TOW 1"
  },
  {
    "tag": "#992PPYP9",
    "name": "TIGERS OF WAR 2",
    "label": "TOW 2"
  },
  {
    "tag": "#QC9RY8GJ",
    "name": "TIGERS OF WAR 3",
    "label": "TOW 3"
  },
  {
    "tag": "#R0UPVVVY",
    "name": "TIGERS OF WAR 4",
    "label": "TOW 4"
  },
  {
    "tag": "#202YP22U9",
    "name": "TIGERS OF WAR 5",
    "label": "TOW 5"
  },
  {
    "tag": "#222RQ2C22",
    "name": "TIGERS OF WAR 6",
    "label": "TOW 6"
  },
  {
    "tag": "#28R20CPP8",
    "name": "TIGERS OF WAR 8",
    "label": "TOW 8"
  },
  {
    "tag": "#2P0Y8JRUL",
    "name": "TIGERS OF WAR 9",
    "label": "TOW 9"
  },
  {
    "tag": "#2QLGRU29U",
    "name": "TOW ACADEMY",
    "label": "TOW Academy"
  },
  {
    "tag": "#2GY9JPQY2",
    "name": "TOW FORMATION",
    "label": "TOW Formation"
  },
  {
    "tag": "#29P0V8VCG",
    "name": "TOW TEAM tm",
    "label": "TOW Team"
  },
  {
    "tag": "#2PG9PV22C",
    "name": "TOW-eSports",
    "label": "TOW Sport"
  },
  {
    "tag": "#2LUJ0V08L",
    "name": "TOW-eVolution™",
    "label": "TOW Evo"
  },
  {
    "tag": "#92RJJJ0Y",
    "name": "TRAIRI-CE",
    "label": "Trairi CE"
  }
]);
export function findClan(value) {
  if (typeof value !== 'string') return null;
  const tag = value.trim().toUpperCase();
  return CLANS.find(c => c.tag === (tag.startsWith('#') ? tag : '#'+tag)) || null;
}
export function preferredClan(value) { return findClan(value)?.tag || DEFAULT_CLAN; }
