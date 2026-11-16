export interface RepairItem { artistId: string; trackId: number; }
const queue: RepairItem[] = [];

// Треки, которые не загрузились в игре и были откреплены. После игры для них ищется перезалив, доступный в регионе админа.
export function queueRepair(artistId: string, trackId: number): void {
  if (!queue.some(q => q.artistId === artistId && q.trackId === trackId)) queue.push({ artistId, trackId });
}
export const takeRepair = (): RepairItem | undefined => queue.shift();
export const repairCount = (): number => queue.length;
