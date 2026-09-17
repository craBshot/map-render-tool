import type { de } from './strings.de'

// TODO: not wired up yet — German is the only active locale (CLAUDE.md).
// Kept structurally identical to strings.de so a future locale switch is a
// drop-in.
export const en: typeof de = {
  app: {
    title: 'Map Zoom',
    lede: 'Frame the map, set start and end, export as video or image sequence.',
  },
  search: {
    heading: 'Find a place',
    placeholder: 'e.g. Jönköping',
    button: 'Search',
  },
  playback: {
    play: 'Play preview',
    stop: 'Stop preview',
    reset: 'Back to start',
  },
  camera: {
    heading: 'Camera flight',
    start: 'Start',
    end: 'Target',
    captureCurrentView: 'Use current view',
    show: 'Show',
    holdStart: 'Hold start (s)',
    zoomDuration: 'Zoom (s)',
    holdEnd: 'Hold end (s)',
  },
  style: {
    heading: 'Appearance',
    mapStyle: 'Map style',
    styles: {
      positron: 'Light, reduced',
      liberty: 'Colorful, detailed',
      bright: 'Colorful, classic',
      dark: 'Dark',
      fiord: 'Dark blue',
    },
    labelDensity: 'Place names',
    densityLevels: ['Capitals only', 'Major cities', 'Cities and towns', 'All places'],
    germanNames: 'German place names where available',
    hideMinor: 'Hide street/POI labels',
  },
  marker: {
    heading: 'Target marker',
    visible: 'Show marker',
    setToCenter: 'Use map center',
    color: 'Color',
    size: 'Size (px)',
    appear: 'Appears',
    appearModes: {
      start: 'At start',
      zoomStart: 'At zoom start',
      zoomEnd: 'At zoom end',
      custom: 'At a fixed time',
    },
    appearAt: 'Time (s)',
    popDuration: 'Pop-in duration (s)',
    pulse: 'Pulse',
    pulsePeriod: 'Pulse period (s)',
    pulseScale: 'Pulse size',
    pulseStrength: 'Pulse strength (%)',
    hint: 'Right-click the map to place the marker there directly.',
  },
}
