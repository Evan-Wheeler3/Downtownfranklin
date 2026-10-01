/**
 * Item catalogue. FICTIONAL gameplay content (names, prices, effects are invented for the game).
 */
export type ItemKind = 'food' | 'drink' | 'gift' | 'book' | 'ticket' | 'parcel' | 'clothing' | 'supply';

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  kind: ItemKind;
  price: number;
  /** Energy restored when consumed (food/drink). */
  energy?: number;
  /** Mood boost when used (tickets, books, gifts). */
  mood?: number;
  desc: string;
}

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  ([
    ['coffee', 'Hot Coffee', '☕', 'drink', 3, 18, 2, 'Fresh, dark and warm. A little pep in your step.'],
    ['latte', 'Honey Latte', '🍯', 'drink', 5, 22, 4, 'Steamed milk, espresso and a spoon of local honey.'],
    ['tea', 'Sweet Tea', '🧋', 'drink', 3, 14, 3, 'Southern-style, over ice.'],
    ['pastry', 'Butter Croissant', '🥐', 'food', 4, 22, 2, 'Flaky, golden, still warm.'],
    ['biscuit', 'Biscuit & Jam', '🍞', 'food', 4, 24, 3, 'A fluffy biscuit with strawberry jam.'],
    ['sandwich', 'Club Sandwich', '🥪', 'food', 9, 40, 2, 'Stacked high and cut in triangles.'],
    ['meal', 'Hearty Plate', '🍲', 'food', 14, 65, 5, 'Something warm, filling, and made with care.'],
    ['pizza', 'Slice of Pizza', '🍕', 'food', 5, 30, 3, 'Cheese stretches for a mile.'],
    ['icecream', 'Ice Cream Cone', '🍦', 'food', 4, 12, 8, 'Two scoops. You deserve it.'],
    ['fudge', 'Box of Fudge', '🍫', 'gift', 7, 10, 6, 'A neat little box, tied with ribbon.'],
    ['lemonade', 'Lemonade', '🍋', 'drink', 3, 14, 4, 'Tart, sweet, and very cold.'],
    ['soda', 'Bottle of Soda', '🥤', 'drink', 2, 10, 2, 'Fizzy.'],
    ['water', 'Water Bottle', '💧', 'drink', 1, 8, 0, 'Simple and necessary.'],
    ['snack', 'Trail Mix', '🥜', 'food', 3, 16, 1, 'Nuts, raisins and the good chocolate bits.'],
    ['flowers', 'Bouquet', '💐', 'gift', 12, 0, 10, 'Wildflowers wrapped in brown paper.'],
    ['novel', 'Paperback Novel', '📕', 'book', 14, 0, 12, 'A story you will not be able to put down.'],
    ['map', 'Town Map', '🗺️', 'book', 6, 0, 3, 'Hand-drawn map of downtown. Unlocks the map view.'],
    ['ticket', 'Show Ticket', '🎟️', 'ticket', 20, 0, 20, 'Admit one. Tonight\'s performance.'],
    ['hat', 'Straw Hat', '👒', 'clothing', 22, 0, 8, 'Perfect for sunny afternoons.'],
    ['scarf', 'Knit Scarf', '🧣', 'clothing', 18, 0, 6, 'Soft and warm, in a cheerful colour.'],
    ['candle', 'Scented Candle', '🕯️', 'gift', 9, 0, 5, 'Smells like cedar and rain.'],
    ['parcel', 'Parcel', '📦', 'parcel', 0, 0, 0, 'Someone is waiting for this.'],
  ] as [string, string, string, ItemKind, number, number, number, string][]).map(([id, name, icon, kind, price, energy, mood, desc]) => [
    id,
    { id, name, icon, kind, price, energy: energy || undefined, mood: mood || undefined, desc },
  ]),
);
