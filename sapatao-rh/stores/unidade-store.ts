import { create } from "zustand";

interface UnidadeState {
  unidadeId: string | null; // null = "todas as unidades"
  setUnidade: (id: string | null) => void;
}

export const useUnidadeStore = create<UnidadeState>((set) => ({
  unidadeId: null,
  setUnidade: (id) => set({ unidadeId: id }),
}));
