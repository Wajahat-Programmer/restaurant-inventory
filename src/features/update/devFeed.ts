import { DocumentDirectoryPath, exists, readFile } from '@dr.pogodin/react-native-fs';

/**
 * Debug builds only (the caller checks __DEV__): if a file named dev-feed.txt
 * sits in the app's files folder, its single line is used as the release feed
 * and its host may serve the download. This lets the whole update flow be
 * tried against a test server on the same computer. A release build never
 * calls this.
 *
 *   adb shell run-as com.restaurantinventory sh -c "echo http://localhost:8099/latest.json > files/dev-feed.txt"
 */
export async function getDevFeed(): Promise<{ feedUrl?: string; extraHosts?: string[] }> {
  const path = `${DocumentDirectoryPath}/dev-feed.txt`;
  if (!(await exists(path))) {
    return {};
  }
  const url = (await readFile(path, 'utf8')).trim();
  const host = /^https?:\/\/([^/:]+)/.exec(url)?.[1];
  return url && host ? { feedUrl: url, extraHosts: [host.toLowerCase()] } : {};
}
