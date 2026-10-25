import { apiClient } from './client'

export interface RadioTrack {
  id: string
  title: string
  mood: string
  description: string
  src: string
  size?: number
  format?: string
  uploaded: boolean
  created_at?: string
}

export interface RadioLibraryStats {
  tracks: number
  total_bytes: number
  max_tracks: number
  max_bytes: number
  max_track_bytes: number
}

export interface RadioLibraryResponse {
  tracks: RadioTrack[]
  stats: RadioLibraryStats
}

export interface RadioUploadOptions {
  signal?: AbortSignal
  onUploadProgress?: (percent: number) => void
}

export async function listTracks(): Promise<RadioTrack[]> {
  const { data } = await apiClient.get<RadioTrack[]>('/radio/tracks')
  return data
}

export async function listAdminTracks(): Promise<RadioLibraryResponse> {
  const { data } = await apiClient.get<RadioLibraryResponse>('/admin/radio/tracks')
  return data
}

export async function uploadTrack(
  file: File,
  options: RadioUploadOptions = {},
): Promise<RadioTrack> {
  const body = new FormData()
  body.append('file', file)
  const { data } = await apiClient.post<RadioTrack>('/admin/radio/tracks', body, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
    signal: options.signal,
    onUploadProgress: (event) => {
      if (!options.onUploadProgress) return
      const total = event.total ?? file.size
      if (total <= 0) return
      options.onUploadProgress(Math.min(100, Math.round((event.loaded / total) * 100)))
    },
  })
  return data
}

export async function deleteTrack(id: string): Promise<void> {
  await apiClient.delete(`/admin/radio/tracks/${encodeURIComponent(id)}`)
}

export const radioAPI = {
  listTracks,
  listAdminTracks,
  uploadTrack,
  deleteTrack,
}

export default radioAPI
