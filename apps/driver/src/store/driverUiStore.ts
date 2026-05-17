import { create } from 'zustand'

interface DriverUiState {
  selectedOrderId: string | null
  setSelectedOrderId: (orderId: string | null) => void
}

export const useDriverUiStore = create<DriverUiState>((set) => ({
  selectedOrderId: null,
  setSelectedOrderId: (orderId) => set({ selectedOrderId: orderId }),
}))
