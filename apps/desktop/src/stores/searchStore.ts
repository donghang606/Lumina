import { useNoteStore } from './noteStore'

export function setFeedKeyword(keyword: string) {
  const store = useNoteStore.getState()
  store.setFeedFilter({ keyword: keyword || undefined })
}