export const DEFAULT_CLAN = '#R0UPVVVY';
export const CLANS = Object.freeze([
  {tag:'#R0UPVVVY',name:'TIGERS OF WAR 4'},
  {tag:'#29P0V8VCG',name:'TOW TEAM tm'},
  {tag:'#28L88PQ2',name:'TIGERS OF WAR'},
  {tag:'#2PG9PV22C',name:'TOW-eSports'},
  {tag:'#202YP22U9',name:'TIGERS OF WAR 5'},
  {tag:'#28R20CPP8',name:'TIGERS OF WAR 8'}
]);
export function findClan(value) {
  if (typeof value !== 'string') return null;
  const tag = value.trim().toUpperCase();
  return CLANS.find(c => c.tag === (tag.startsWith('#') ? tag : '#'+tag)) || null;
}
export function preferredClan(value) { return findClan(value)?.tag || DEFAULT_CLAN; }
