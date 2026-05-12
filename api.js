// api.js - GitHub API operations

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
    const response = await fetch(url, { headers: getAuthHeaders(token) });
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`GitHub API error: ${response.status}`);
    }
    const data = await response.json();
    return {
      sha: data.sha,
      content: atob(data.content.replace(/\n/g, '')),
      encoding: 'base64'
    };
  }

  async function updateFile(owner, repo, path, content, commitMessage, branch, token, sha = null) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const body = {
      message: commitMessage,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
      branch: branch
    };
    if (sha) body.sha = sha;

    const response = await fetch(url, {
      method: 'PUT',
      headers: getAuthHeaders(token),
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to update file: ${error.message}`);
    }
    return response.json();
  }

  async function createUserDirectory(owner, repo, path, token) {
    // GitHub creates directories when you add a file; we'll create a .gitkeep
    return updateFile(owner, repo, `${path}/.gitkeep`, '', 'Create user directory', 'main', token);
  }

  return { getFileContent, updateFile, createUserDirectory };
})();