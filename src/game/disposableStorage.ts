/**
 * 端末の保存領域に置いている「控え」の鍵。
 *
 * **本体のセーブより大事なものは無い。**保存領域(Safari は1サイト5MB前後)が
 * 一杯になった時は、ここに並べた控えを捨ててでも本体を書く。
 *
 * 依頼主の端末で、起動時の控えが**縮めていない整形JSON**(本体の約14倍)のまま残り、
 * 344KBの本体が入らなくなっていた。保管所へ預ける・召喚するなど、
 * あらゆる保存が「データを保存できていません」で止まっていた。
 *
 * 並びは捨てる順。起動時の控えは次の起動で取り直せるので先に捨てる。
 * クラウド復元前の控えは、復元を取り消すための最後の綱なので後に回す。
 */
export const STARTUP_BACKUP_KEY = "crimon_save_backup_v1";
export const STARTUP_BACKUP_AT_KEY = "crimon_save_backup_at_v1";
export const CLOUD_RESTORE_BACKUP_KEY = "crimon_save_before_cloud_restore_v1";
export const CLOUD_RESTORE_BACKUP_AT_KEY = "crimon_save_before_cloud_restore_at_v1";

export const DISPOSABLE_BACKUP_KEYS: readonly (readonly string[])[] = [
  [STARTUP_BACKUP_KEY, STARTUP_BACKUP_AT_KEY],
  [CLOUD_RESTORE_BACKUP_KEY, CLOUD_RESTORE_BACKUP_AT_KEY],
];
