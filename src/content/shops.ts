/**
 * Shop profiles keyed by business category. FICTIONAL gameplay content: stock, prices and
 * opening hours are invented (real business hours are UNKNOWN — D-013). Real names/positions of
 * businesses come from world data; only what they sell in-game is made up.
 */
export interface ShopProfile {
  key: string;
  title: string;
  /** Item ids sold. Empty = no counter (you can still chat / take jobs). */
  stock: string[];
  /** FICTIONAL opening hours, 24 h clock; close may exceed 24 (past midnight). */
  open: number;
  close: number;
  greetings: string[];
}

export const PROFILES: Record<string, ShopProfile> = {
  cafe: {
    key: 'cafe', title: 'Café', stock: ['coffee', 'latte', 'tea', 'pastry', 'biscuit'], open: 6, close: 18,
    greetings: ['Morning! The coffee\'s fresh.', 'Pull up a chair, stay a while.', 'You look like you need a latte.'],
  },
  restaurant: {
    key: 'restaurant', title: 'Kitchen', stock: ['meal', 'sandwich', 'lemonade', 'tea'], open: 11, close: 22,
    greetings: ['Table for one? Right this way.', 'Today\'s special is something warm.', 'Welcome in — hungry?'],
  },
  pizza: {
    key: 'pizza', title: 'Pizzeria', stock: ['pizza', 'soda', 'lemonade'], open: 11, close: 23,
    greetings: ['Hot slices, coming up!', 'Grab a slice for the road.'],
  },
  bar: {
    key: 'bar', title: 'Tavern', stock: ['sandwich', 'soda', 'lemonade'], open: 16, close: 26,
    greetings: ['Live music later tonight.', 'Evening! What can I get you?'],
  },
  sweets: {
    key: 'sweets', title: 'Sweet Shop', stock: ['icecream', 'fudge', 'soda'], open: 10, close: 21,
    greetings: ['Free sample? Go on.', 'Everything here is made in the back.'],
  },
  bakery: {
    key: 'bakery', title: 'Bakery', stock: ['pastry', 'biscuit', 'coffee'], open: 6, close: 15,
    greetings: ['Just out of the oven!', 'Smell that? Cinnamon day.'],
  },
  books: {
    key: 'books', title: 'Bookshop', stock: ['novel', 'map', 'candle'], open: 10, close: 18,
    greetings: ['Take your time browsing.', 'Looking for anything in particular?'],
  },
  florist: {
    key: 'florist', title: 'Florist', stock: ['flowers', 'candle'], open: 9, close: 17,
    greetings: ['Fresh cut this morning.', 'Something for someone special?'],
  },
  clothing: {
    key: 'clothing', title: 'Boutique', stock: ['hat', 'scarf'], open: 10, close: 19,
    greetings: ['That colour would suit you.', 'Let me know if you\'d like to try anything on.'],
  },
  gifts: {
    key: 'gifts', title: 'Gift Shop', stock: ['candle', 'fudge', 'map'], open: 10, close: 18,
    greetings: ['Lots of little treasures in here.', 'Shopping for a gift?'],
  },
  market: {
    key: 'market', title: 'Corner Store', stock: ['water', 'soda', 'snack', 'sandwich'], open: 7, close: 22,
    greetings: ['Let me know if you can\'t find something.', 'Evening! Grab what you need.'],
  },
  theatre: {
    key: 'theatre', title: 'Box Office', stock: ['ticket', 'soda', 'snack'], open: 12, close: 23,
    greetings: ['The show starts at eight.', 'Seats are filling up fast tonight.'],
  },
  office: {
    key: 'office', title: 'Front Desk', stock: [], open: 8, close: 17,
    greetings: ['Hello there. Can I help you?', 'We\'re a bit busy, but say hi anytime.'],
  },
  service: {
    key: 'service', title: 'Shop', stock: ['water'], open: 9, close: 18,
    greetings: ['Hi! Come on in.', 'Welcome!'],
  },
};

const RULES: [RegExp, string][] = [
  [/coffee|cafe|tea_room|espresso/, 'cafe'],
  [/bakery|donut|dessert_shop|cupcake/, 'bakery'],
  [/ice_cream|candy|chocolate|confection|sweet/, 'sweets'],
  [/pizza/, 'pizza'],
  [/bar$|_bar|pub|brewery|tavern|wine|cocktail|lounge/, 'bar'],
  [/restaurant|diner|grill|eatery|food|barbecue|bbq|burger|sandwich|taco|deli/, 'restaurant'],
  [/book/, 'books'],
  [/florist|flower|garden/, 'florist'],
  [/clothing|boutique|fashion|shoe|apparel|jewel|accessor/, 'clothing'],
  [/theat|cinema|movie|music_venue|performing_arts|concert/, 'theatre'],
  [/gift|antique|art_gallery|art_supply|craft|toy|home_goods|decor|furniture|souvenir/, 'gifts'],
  [/grocery|convenience|market|pharmacy|drugstore|liquor/, 'market'],
  [/lawyer|attorney|bank|financ|insurance|real_estate|accountant|office|consult|agency|government|church|worship|clinic|dentist|doctor|medical/, 'office'],
];

export function profileFor(category: string | undefined, path: string[] | undefined): ShopProfile {
  const hay = [category ?? '', ...(path ?? [])].join(' ').toLowerCase();
  for (const [re, key] of RULES) if (re.test(hay)) return PROFILES[key]!;
  return PROFILES.service!;
}

/** Whether the profile is open at a given hour of day (0..24). */
export function isOpen(p: ShopProfile, hour: number): boolean {
  if (p.close > 24) return hour >= p.open || hour < p.close - 24;
  return hour >= p.open && hour < p.close;
}
