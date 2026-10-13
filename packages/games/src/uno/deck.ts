export interface UnoCard {
  id: string;
  color: string;
  value: string;
}
export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export function deck(random: () => number): UnoCard[] {
  const cards: UnoCard[] = [];
  const add = (color: string, value: string) =>
    cards.push({ id: `card-${cards.length}`, color, value });
  for (const color of COLORS) {
    add(color, '0');
    for (let copy = 0; copy < 2; copy++)
      for (const value of [
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '7',
        '8',
        '9',
        'skip',
        'reverse',
        'draw2',
      ])
        add(color, value);
  }
  for (let n = 0; n < 4; n++) {
    add('wild', 'wild');
    add('wild', 'wild4');
  }
  return shuffle(cards, random);
}
export function shuffle<T>(items: T[], random: () => number): T[] {
  for (let n = items.length - 1; n > 0; n--) {
    const i = Math.floor(Math.max(0, Math.min(0.999999, random())) * (n + 1));
    [items[n], items[i]] = [items[i]!, items[n]!];
  }
  return items;
}
