const GitHubAPI = (() => {
  function getAuthHeaders(token) {
    return {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    };
  }

  async function getFileContent(owner, repo, path, branch, token) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const resp = await fetch(url, { headers: getAuthHeaders(token) });
    if (!resp.ok) {
      if (resp.status === 404) return null;
      throw new Error(`GitHub API error: ${resp.status}`);
    }
    const data = await resp.json();
    return {
      sha: data.sha,
      content: atob(data.content.replace(/\n/g, '')),
      encoding: 'base64'
    };
  }

  async function updateFile(owner, repo, path, content, commitMsg, branch, token, sha = null) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const body = {
      message: commitMsg,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
      branch: branch
    };
    if (sha) body.sha = sha;
    const resp = await fetch(url, {
      method: 'PUT', headers: getAuthHeaders(token), body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(`Update failed: ${err.message}`);
    }
    return resp.json();
  }

  async function deleteFile(owner, repo, path, branch, token, sha) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders(token),
      body: JSON.stringify({ message: 'Delete', branch, sha })
    });
    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(`Delete failed: ${err.message}`);
    }
    return resp.json();
  }

  return { getFileContent, updateFile, deleteFile };
})();
