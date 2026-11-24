export const mapRepo = (r) => ({
  id: r.id, name: r.name, fullName: r.full_name, owner: r.owner.login, private: r.private,
  defaultBranch: r.default_branch, description: r.description, pushedAt: r.pushed_at,
  canPush: r.permissions ? !!r.permissions.push : true, url: r.html_url, size: r.size,
});
