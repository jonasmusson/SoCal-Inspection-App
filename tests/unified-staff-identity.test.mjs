import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(resolve(root,path),'utf8');

const identityMigration='supabase/migrations/20260912181500_012_unified_team_profile_identity.sql';

test('Inspection App user profiles carry the canonical SoCal Team Profile ID',()=>{
  const types=read('src/types/index.ts');
  const migration=read(identityMigration);
  assert.match(types,/team_profile_id:\s*string \| null/);
  assert.match(migration,/add column if not exists team_profile_id text/i);
  assert.match(migration,/create unique index if not exists user_profiles_team_profile_id_unique/i);
  assert.match(migration,/where team_profile_id is not null/i);
});

test('Team Profile linking RPC uses the existing manager-owner authorization helper',()=>{
  const migration=read(identityMigration);
  const managerHelper=read('supabase/migrations/20260613223736_004_fix_is_manager_function.sql');
  assert.match(managerHelper,/function is_manager_or_owner\(\)/i);
  assert.match(migration,/public\.is_manager_or_owner\(\)/);
  assert.doesNotMatch(migration,/public\.is_manager\(\)/);
});

test('Team Profile linking RPC is bounded and does not expose SECURITY DEFINER broadly',()=>{
  const migration=read(identityMigration);
  assert.match(migration,/security definer/i);
  assert.match(migration,/set search_path = public/i);
  assert.match(migration,/length\(normalized_team_profile_id\) > 100/);
  assert.match(migration,/revoke all on function public\.link_user_team_profile\(uuid, text\) from public/i);
  assert.match(migration,/grant execute on function public\.link_user_team_profile\(uuid, text\) to authenticated/i);
});
