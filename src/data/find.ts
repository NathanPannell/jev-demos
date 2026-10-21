export interface Painting {
  id: string
  title: string
  src: string
  credit: string
  sourceUrl: string
}

export const PROVERBS: Painting = {
  id: 'proverbs',
  title: 'Netherlandish Proverbs',
  src: '/samples/find/netherlandish-proverbs.jpg',
  credit:
    'Pieter Bruegel the Elder, Netherlandish Proverbs (1559), Gemäldegalerie, Berlin. Public domain, via Wikimedia Commons.',
  sourceUrl:
    'https://commons.wikimedia.org/wiki/File:Pieter_Brueghel_the_Elder_-_The_Dutch_Proverbs_-_Google_Art_Project.jpg',
}

export const CHILDRENS_GAMES: Painting = {
  id: 'games',
  title: "Children's Games",
  src: '/samples/find/childrens-games.jpg',
  credit:
    "Pieter Bruegel the Elder, Children's Games (1560), Kunsthistorisches Museum, Vienna. Public domain, via Wikimedia Commons.",
  sourceUrl:
    'https://commons.wikimedia.org/wiki/File:Pieter_Bruegel_the_Elder_-_Children%E2%80%99s_Games_-_Google_Art_Project.jpg',
}

/** The puzzle targets: proverbs hidden in the painting. */
export const TARGETS: { id: string; proverb: string; prompt: string }[] = [
  {
    id: 'pies',
    proverb: 'The roof is tiled with tarts',
    prompt: 'a roof covered with pies',
  },
  {
    id: 'bell',
    proverb: 'To bell the cat',
    prompt: 'a man in armor tying a bell on a cat',
  },
  {
    id: 'globe',
    proverb: 'The world is turned upside down',
    prompt: 'an upside-down globe with a cross hanging outside a house',
  },
  {
    id: 'fire',
    proverb: 'To carry fire in one hand and water in the other',
    prompt: 'a woman carrying fire in one hand and a bucket of water in the other',
  },
  {
    id: 'well',
    proverb: 'To fill in the well after the calf has drowned',
    prompt: 'a man filling in a well after the calf has drowned in it',
  },
  {
    id: 'wall',
    proverb: 'To bang your head against a brick wall',
    prompt: 'a man banging his head against a brick wall',
  },
]

export const SAMPLE_IMAGES = [
  { id: 'games', label: "Bruegel's Children's Games", src: CHILDRENS_GAMES.src },
  { id: 'proverbs', label: 'Netherlandish Proverbs', src: PROVERBS.src },
  { id: 'audit', label: 'An app screenshot', src: '/samples/audit/primaries.png' },
]
