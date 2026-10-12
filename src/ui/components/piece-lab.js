/* Piece stats: how one piece's stats come from its item level, line by line, and what sync does to them. */
import Alpine from 'alpinejs';
import { pieceView, withSub } from '../views/piece.js';
export function pieceLab() {
  return {
    view: null,
    init() {
      Alpine.effect(() => {
        this.view = pieceView(this.$store.app);
      });
    },
    setSub(i, value) {
      const p = this.$store.app.piece;
      p.subs = withSub(p.subs, i, value, this.job.substats);
    },
    setFromRange(value) {
      this.$store.app.piece.ilvl = +value;
    },
  };
}
