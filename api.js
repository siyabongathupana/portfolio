// api.js – GitHub API operations with retry and conflict handling
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

  async function updateFile(owner, repo, path, content, commitMsg, branch, token, sha = null, retries = 3) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    
    // If no SHA provided, try to fetch latest first (to avoid blind overwrite)
    let currentSha = sha;
    if (!currentSha) {
      try {
        const existing = await getFileContent(owner, repo, path, branch, token);
        if (existing) currentSha = existing.sha;
      } catch (err) {
        // File might not exist yet – that's fine
        console.log('No existing file, will create new');
      }
    }

    const body = {
      message: commitMsg,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
      branch: branch
    };
    if (currentSha) body.sha = currentSha;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const resp = await fetch(url, {
          method: 'PUT',
          headers: getAuthHeaders(token),
          body: JSON.stringify(body)
        });
        
        if (!resp.ok) {
          const err = await resp.json();
          // 409 Conflict – SHA mismatch, need to refetch
          if (resp.status === 409 && attempt < retries) {
            console.log(`Conflict detected, retrying (${attempt}/${retries})...`);
            // Refetch latest SHA
            const latest = await getFileContent(owner, repo, path, branch, token);
            if (latest) body.sha = latest.sha;
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
            continue;
          }
          throw new Error(`Update failed: ${err.message}`);
        }
        return await resp.json();
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }
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
