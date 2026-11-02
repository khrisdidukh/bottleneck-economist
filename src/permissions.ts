// Permission checks for user-initiated operations. The app reads Jira as the app (the analysis runs in a
// background queue), so every request first confirms that the *calling user* may see the project
// (BROWSE_PROJECTS) or, for settings that change what everyone sees, administer it (ADMINISTER_PROJECTS).
import api, { route } from '@forge/api';

export type ProjectPermission = 'BROWSE_PROJECTS' | 'ADMINISTER_PROJECTS';
const KEY = /^[A-Z][A-Z0-9_]{0,19}$/;

export async function userCan(projectKey: string | undefined, permission: ProjectPermission): Promise<boolean> {
  if (!projectKey || !KEY.test(projectKey)) return false;
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=${permission}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return false;
    const body: any = await res.json();
    return body?.permissions?.[permission]?.havePermission === true;
  } catch {
    return false;
  }
}

export const DENIED = { status: 'forbidden', message: 'You do not have permission to see this project.' } as const;
export const DENIED_ADMIN = { status: 'forbidden', message: 'Only project administrators can change these settings.' } as const;
