import GitHubStorage from '../github-storage';

// Define API request and response types
interface ApiRequest {
  method?: string;
  body?: any;
  query?: { [key: string]: string | string[] | undefined };
  headers?: { [key: string]: string | string[] | undefined };
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: any) => void;
  setHeader: (name: string, value: string) => void;
  end: (data?: any) => void;
}

// Define the resume data interface
interface ResumeData {
  personalInfo: any;
  experience: Array<{
    id: number;
    company: string;
    title: string;
    startDate: string;
    endDate: string;
    description: string;
    technologies: string[];
    achievements?: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    year: string;
    gpa: string;
  }>;
  certifications: Array<{
    name: string;
    issuer: string;
    date: string;
  }>;
  skills: { 
    languages: string[];
    frameworks: string[];
    databases: string[];
    technologies: string[];
    versionControl: string[];
    methodologies: string[];
    standards: string[];
  };
  projects: any[];
  additionalInfo: string;
}

export const config = {
  api: {
    bodyParser: true,
    sizeLimit: "1mb",
  },
};

// Consolidated admin API endpoint
// Handles all admin operations based on query parameters
// GET /api/admin?type=resume - Read resume data
// POST /api/admin?type=resume - Save resume data
// DELETE /api/admin?type=resume - Reset resume data
// GET /api/admin?type=experience&id=1 - Get experience by ID
// POST /api/admin?type=experience - Add experience
// PUT /api/admin?type=experience&id=1 - Update experience
// DELETE /api/admin?type=experience&id=1 - Delete experience
// Similar for education and certifications

// GitHub storage instance
const githubStorage = new GitHubStorage();

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();

  const type = req.query?.type;
  const id = req.query?.id;
  const slug = req.query?.slug;

  // Handle portfolio requests (for private repos)
  if (type === 'portfolio') {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ error: 'Slug parameter is required' });
    }

    try {
      // Read resume data from GitHub storage
      const resumeData = await githubStorage.readResumeData();
      
      // Find project by slug
      const project = resumeData.projects?.find((p: any) => p.slug === slug);
      
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (!project.isPrivateRepo || !project.portfolioFile) {
        return res.status(400).json({ 
          error: 'Project portfolio should be fetched from GitHub',
          githubUrl: project.githubUrl 
        });
      }

      // Fetch portfolio content from GitHub
      const portfolioFile = `data/portfolios/${project.portfolioFile}`;
      const content = await githubStorage.getFileContent(portfolioFile);
      
      if (!content) {
        return res.status(404).json({ error: 'Portfolio file not found' });
      }
      
      return res.status(200).json({
        success: true,
        slug,
        content,
        project: {
          name: project.name,
          description: project.description,
          githubUrl: project.githubUrl,
          isPrivateRepo: project.isPrivateRepo
        }
      });
    } catch (error) {
      console.error('Error serving portfolio:', error);
      return res.status(500).json({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  try {
    // Read current data from GitHub
    let resumeData: ResumeData;
    try {
      resumeData = await githubStorage.readResumeData();
    } catch (error) {
      console.error('Failed to read from GitHub:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to read resume data from GitHub',
        error: error.message
      });
    }

    if (type === 'resume') {
      if (req.method === "GET") {
        // Check for version control operations
        const action = req.query?.action;
        
        if (action === 'history') {
          // Get commit history
          try {
            const history = await githubStorage.getCommitHistory(20);
            return res.status(200).json({
              success: true,
              history: history,
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            return res.status(500).json({
              success: false,
              message: 'Failed to get commit history',
              error: error.message
            });
          }
        } else if (action === 'restore') {
          // Restore from specific commit
          const commitSha = req.query?.commit;
          if (!commitSha) {
            return res.status(400).json({
              success: false,
              message: 'Commit SHA is required for restore operation'
            });
          }
          
          try {
            const result = await githubStorage.restoreFromCommit(commitSha, resumeData);
            if (result.success) {
              return res.status(200).json({
                success: true,
                message: result.message,
                commit: result.commit,
                url: result.url,
                restoredFrom: result.restoredFrom,
                timestamp: new Date().toISOString()
              });
            } else {
              return res.status(500).json({
                success: false,
                message: 'Failed to restore from commit',
                error: result.error
              });
            }
          } catch (error) {
            return res.status(500).json({
              success: false,
              message: 'Failed to restore from commit',
              error: error.message
            });
          }
        } else if (action === 'preview') {
          // Preview data from specific commit without restoring
          const commitSha = req.query?.commit;
          if (!commitSha) {
            return res.status(400).json({
              success: false,
              message: 'Commit SHA is required for preview operation'
            });
          }
          
          try {
            const commitData = await githubStorage.getResumeDataFromCommit(commitSha);
            return res.status(200).json({
              success: true,
              data: commitData,
              commit: commitSha,
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            return res.status(500).json({
              success: false,
              message: 'Failed to preview commit data',
              error: error.message
            });
          }
        }
        
        // Default: return current resume data
        return res.status(200).json({
          success: true,
          data: resumeData,
          timestamp: new Date().toISOString()
        });
      } else if (req.method === "POST") {
        // Save resume data
        const newData = req.body;
        if (!newData || typeof newData !== 'object') {
          return res.status(400).json({
            success: false,
            message: 'Invalid resume data format'
          });
        }

        // Validate required fields
        if (!newData.personalInfo || !newData.experience || !newData.education || !newData.skills) {
          return res.status(400).json({
            success: false,
            message: 'Missing required resume sections'
          });
        }

        // Create backup before updating
        try {
          await githubStorage.createBackup(resumeData);
        } catch (backupError) {
          console.warn('Failed to create backup:', backupError);
        }

        // Write the updated data to GitHub
        try {
          const result = await githubStorage.writeResumeData(newData);
          
          if (result.success) {
        return res.status(200).json({
          success: true,
              message: 'Resume data saved successfully to GitHub',
              commit: result.commit,
              url: result.url,
          timestamp: new Date().toISOString()
        });
          } else {
            return res.status(500).json({
              success: false,
              message: 'Failed to save resume data to GitHub',
              error: result.error
            });
          }
        } catch (writeError: any) {
          console.error('GitHub write error:', writeError);
          return res.status(500).json({
            success: false,
            message: 'Failed to save resume data to GitHub',
            error: writeError?.message || 'GitHub write operation failed'
          });
        }
      } else if (req.method === "DELETE") {
        // Reset resume data
        const defaultData = {
          personalInfo: { name: "", email: "", phone: "", location: "", linkedin: "", github: "", website: "", summary: "" },
          experience: [],
          education: [],
          certifications: [],
          skills: { languages: [], frameworks: [], databases: [], technologies: [], versionControl: [], methodologies: [], standards: [] },
          projects: [],
          additionalInfo: ""
        };

        // Create backup before resetting
        try {
          await githubStorage.createBackup(resumeData);
        } catch (backupError) {
          console.warn('Failed to create backup:', backupError);
        }

        // Write default data to GitHub
        try {
          const result = await githubStorage.writeResumeData(defaultData);
          
          if (result.success) {
            return res.status(200).json({
              success: true,
              message: 'Resume data reset to default in GitHub',
              commit: result.commit,
              url: result.url,
              timestamp: new Date().toISOString()
            });
          } else {
            return res.status(500).json({
              success: false,
              message: 'Failed to reset resume data in GitHub',
              error: result.error
            });
          }
        } catch (writeError: any) {
          console.error('GitHub write error:', writeError);
          return res.status(500).json({
            success: false,
            message: 'Failed to reset resume data in GitHub',
            error: writeError?.message || 'GitHub write operation failed'
          });
        }
      }
    }

    // Handle GitHub Activity operations
    if (type === 'github-activity') {
      if (req.method === "GET") {
        try {
          const username = req.query?.username as string;
          if (!username) {
            return res.status(400).json({
              success: false,
              message: 'Username is required'
            });
          }

          // Fetch user repos (including private)
          // First try to get authenticated user's repos (includes private)
          let reposResponse;
          try {
            reposResponse = await githubStorage.octokit.repos.listForAuthenticatedUser({
              sort: 'updated',
              per_page: 100,
              type: 'all'
            });
          } catch (error) {
            // Fallback to public repos if authenticated user call fails
            console.warn('Failed to fetch authenticated user repos, falling back to public:', error);
            reposResponse = await githubStorage.octokit.repos.listForUser({
              username: username,
              sort: 'updated',
              per_page: 100,
              type: 'public'
            });
          }

          const repos = reposResponse.data;

          // Fetch user profile
          let userResponse;
          try {
            // Try to get authenticated user profile first (includes private repo count)
            userResponse = await githubStorage.octokit.users.getAuthenticated();
          } catch (error) {
            // Fallback to public user profile
            console.warn('Failed to fetch authenticated user profile, falling back to public:', error);
            userResponse = await githubStorage.octokit.users.getByUsername({
              username: username
            });
          }

          const user = userResponse.data;

          // Process repos with additional data
          const reposWithCommits = await Promise.all(
            repos.slice(0, 100).map(async (repo: any) => {
              try {
                // Use the repo's owner from the API response, not the username parameter
                // This handles cases where username might differ from repo owner
                const repoOwner = repo.owner?.login || username;
                const repoFullName = repo.full_name || `${repoOwner}/${repo.name}`;
                
                const commitsResponse = await githubStorage.octokit.repos.listCommits({
                  owner: repoOwner,
                  repo: repo.name,
                  per_page: 1
                });
                
                const commitsLink = commitsResponse.headers.link;
                let commits_count = 1;
                if (commitsLink) {
                  const match = commitsLink.match(/&page=(\d+)>; rel="last"/);
                  if (match) commits_count = parseInt(match[1]);
                }

                return {
                  name: repo.name,
                  full_name: repoFullName,
                  html_url: repo.html_url,
                  description: repo.description,
                  language: repo.language,
                  stargazers_count: repo.stargazers_count,
                  forks_count: repo.forks_count,
                  commits_count,
                  updated_at: repo.updated_at,
                  size: repo.size,
                  topics: repo.topics || [],
                  visibility: repo.private ? 'private' : 'public',
                  owner: repoOwner
                };
              } catch (err) {
                console.warn(`Failed to fetch commits for ${repo.name}:`, err);
                const repoOwner = repo.owner?.login || username;
                const repoFullName = repo.full_name || `${repoOwner}/${repo.name}`;
                return {
                  name: repo.name,
                  full_name: repoFullName,
                  html_url: repo.html_url,
                  description: repo.description,
                  language: repo.language,
                  stargazers_count: repo.stargazers_count,
                  forks_count: repo.forks_count,
                  commits_count: 0,
                  updated_at: repo.updated_at,
                  size: repo.size,
                  topics: repo.topics || [],
                  visibility: repo.private ? 'private' : 'public',
                  owner: repoOwner
                };
              }
            })
          );

          // Calculate stats
          const totalStars = reposWithCommits.reduce((sum, repo) => sum + repo.stargazers_count, 0);
          const totalForks = reposWithCommits.reduce((sum, repo) => sum + repo.forks_count, 0);
          const totalCommits = reposWithCommits.reduce((sum, repo) => sum + repo.commits_count, 0);
          
          // Count private vs public repos
          const privateRepos = reposWithCommits.filter(repo => repo.visibility === 'private').length;
          const publicRepos = reposWithCommits.filter(repo => repo.visibility === 'public').length;
          
          // Language distribution
          const languages: Record<string, number> = {};
          reposWithCommits.forEach(repo => {
            if (repo.language) {
              languages[repo.language] = (languages[repo.language] || 0) + 1;
            }
          });

          const topRepos = reposWithCommits.sort((a, b) => b.commits_count - a.commits_count).slice(0, 12);

          // Fetch user events (commits, PRs, reviews, issues)
          let events: any[] = [];
          try {
            // Fetch public events (last 30 days, up to 300 events)
            const eventsResponse = await githubStorage.octokit.activity.listPublicEventsForUser({
              username: username,
              per_page: 100
            });
            events = eventsResponse.data;
          } catch (error) {
            console.warn('Failed to fetch user events:', error);
          }

          // Calculate date range: last year (matching GitHub's contribution graph)
          const since = new Date();
          since.setFullYear(since.getFullYear() - 1);
          const sinceDateStr = since.toISOString().split('T')[0]; // Format: YYYY-MM-DD
          
          console.log(`📊 Fetching GitHub activity for ${username}`, {
            totalRepos: reposWithCommits.length,
            dateRange: `Last year (since ${sinceDateStr})`,
            method: 'GitHub Search API'
          });
          
          // Use GitHub Search API to fetch commits by username and date range
          // This automatically includes all commits from all emails associated with the account
          const commitEvents: any[] = [];
          const existingShas = new Set<string>(); // Track all commit SHAs to avoid duplicates
          const repoDisplayNameMap = new Map<string, { name: string; full_name: string }>(); // Map original repo names to display names
          
          try {
            // Build search query: author:username author-date:>YYYY-MM-DD
            // This will find all commits by the user regardless of which email they used
            const searchQuery = `author:${username} author-date:>${sinceDateStr}`;
            
            let page = 1;
            let hasMore = true;
            const maxPages = 10; // GitHub Search API returns up to 1000 results (10 pages * 100 per page)
            
            while (hasMore && page <= maxPages) {
              try {
                const searchResponse = await githubStorage.octokit.search.commits({
                  q: searchQuery,
                  sort: 'author-date',
                  order: 'desc',
                  per_page: 100,
                  page: page
                });

                if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
                  hasMore = false;
                  break;
                }

                searchResponse.data.items.forEach((item: any) => {
                  const commit = item.commit;
                  const sha = item.sha;
                  
                  // Skip if we've already seen this commit
                  if (existingShas.has(sha)) return;

                  existingShas.add(sha);
                  
                  // Extract repository info from the search result
                  // GitHub Search API returns repository object with full_name
                  const repo = item.repository;
                  const isPrivate = repo?.private === true;
                  const repoOwner = repo?.owner?.login || username;
                  const repoName = repo?.name || 'Unknown';
                  const repoFullName = repo?.full_name || 
                                     (repoOwner && repoName ? `${repoOwner}/${repoName}` : null) ||
                                     'Unknown';
                  
                  // For private repos, use organization name if available, otherwise show "Private Repo"
                  // Use cached display name if we've seen this repo before to ensure consistency
                  let displayRepoName = repoName;
                  let displayFullName = repoFullName;
                  
                  if (repoDisplayNameMap.has(repoFullName)) {
                    // Use cached display name for consistency
                    const cached = repoDisplayNameMap.get(repoFullName)!;
                    displayRepoName = cached.name;
                    displayFullName = cached.full_name;
                  } else if (isPrivate) {
                    // Check if it's an organization repo
                    const isOrgRepo = repo?.owner?.type === 'Organization';
                    if (isOrgRepo && repoOwner) {
                      // Show organization name for private org repos
                      displayRepoName = repoOwner;
                      displayFullName = `${repoOwner}/[Private]`;
                    } else {
                      // Show "Private Repo" for private personal repos
                      displayRepoName = 'Private Repo';
                      displayFullName = `${repoOwner}/[Private]`;
                    }
                    // Cache the display name for this repo
                    repoDisplayNameMap.set(repoFullName, { name: displayRepoName, full_name: displayFullName });
                  }
                  
                  commitEvents.push({
                    type: 'PushEvent',
                    repo: {
                      name: displayRepoName,
                      full_name: displayFullName,
                      private: isPrivate,
                      owner: repoOwner,
                      original_name: repoName, // Keep original name for reference
                      original_full_name: repoFullName // Keep original full_name for reference
                    },
                    created_at: commit.author?.date || commit.committer?.date,
                    payload: {
                      commits: [{
                        sha: sha,
                        message: commit.message,
                        author: commit.author
                      }]
                    }
                  });
                });

                // Check if there are more pages
                // GitHub Search API returns total_count, but we need to check if we got a full page
                hasMore = searchResponse.data.items.length === 100 && page < maxPages;
                page++;
                
                // Small delay to avoid rate limits (Search API has stricter rate limits)
                if (hasMore) {
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              } catch (pageErr: any) {
                console.warn(`Failed to fetch commits page ${page} via search API:`, pageErr?.message || pageErr);
                hasMore = false;
              }
            }
            
            console.log(`✅ Fetched ${commitEvents.length} commits via Search API`);
          } catch (searchErr: any) {
            console.warn(`Failed to fetch commits via Search API:`, searchErr?.message || searchErr);
            // Fallback: if search API fails, we'll just use the events we already have
          }

          // Merge commit events with other events, avoiding duplicates
          const existingEventKeys = new Set(events.map((e: any) => {
            const date = e.created_at?.split('T')[0];
            const repo = e.repo?.full_name;
            return `${date}-${repo}`;
          }));

          commitEvents.forEach((commitEvent: any) => {
            const date = commitEvent.created_at?.split('T')[0];
            const repo = commitEvent.repo?.full_name;
            const key = `${date}-${repo}`;
            if (!existingEventKeys.has(key)) {
              events.push(commitEvent);
            }
          });

          // Sort events by date (newest first)
          events.sort((a: any, b: any) => 
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
          );

          console.log(`✅ GitHub Activity API Response:`, {
            totalRepos: reposWithCommits.length,
            totalEvents: events.length,
            totalCommits: commitEvents.length,
            dateRange: events.length > 0 ? {
              earliest: events[events.length - 1]?.created_at,
              latest: events[0]?.created_at
            } : 'No events',
            uniqueRepos: [...new Set(events.map((e: any) => e.repo?.full_name))].length
          });

        return res.status(200).json({
          success: true,
            repos: reposWithCommits.map((r: any) => ({
              ...r,
              full_name: r.full_name || `${r.owner || username}/${r.name}`
            })),
            events: events,
            stats: {
              totalRepos: user.public_repos + (user.total_private_repos || 0),
              totalStars,
              totalForks,
              totalCommits,
              languages,
              privateRepos,
              publicRepos
            },
            user: {
              login: user.login,
              name: user.name,
              bio: user.bio,
              avatar_url: user.avatar_url,
              html_url: user.html_url,
              followers: user.followers,
              following: user.following,
              public_repos: user.public_repos,
              created_at: user.created_at
            },
          timestamp: new Date().toISOString()
        });
        } catch (error) {
          console.error('GitHub Activity API Error:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to fetch GitHub activity data',
            error: error.message
          });
        }
      }
    }

    // Handle experience operations
    if (type === 'experience') {
      if (!resumeData.experience) resumeData.experience = [];

      if (req.method === "GET") {
        if (id) {
          const experience = resumeData.experience.find((exp: any) => exp.id === parseInt(id as string));
          return res.status(200).json({
            success: true,
            data: experience || null,
            timestamp: new Date().toISOString()
          });
        } else {
          return res.status(200).json({
            success: true,
            data: resumeData.experience,
            timestamp: new Date().toISOString()
          });
        }
      } else if (req.method === "POST") {
        // Add new experience
        const newExperience = {
          id: Math.max(...resumeData.experience.map((exp: any) => exp.id || 0), 0) + 1,
          ...req.body
        };
        resumeData.experience.push(newExperience);
      } else if (req.method === "PUT" && id) {
        // Update experience
        const index = resumeData.experience.findIndex((exp: any) => exp.id === parseInt(id as string));
        if (index !== -1) {
          resumeData.experience[index] = { ...resumeData.experience[index], ...req.body };
        }
      } else if (req.method === "DELETE" && id) {
        // Delete experience
        resumeData.experience = resumeData.experience.filter((exp: any) => exp.id !== parseInt(id as string));
      }

      // Save updated data to GitHub
      try {
        const result = await githubStorage.writeResumeData(resumeData);
        
        if (result.success) {
      return res.status(200).json({
        success: true,
            message: 'Experience operation completed in GitHub',
            commit: result.commit,
        timestamp: new Date().toISOString()
      });
        } else {
          return res.status(500).json({
            success: false,
            message: 'Failed to save experience data to GitHub',
            error: result.error
          });
        }
      } catch (writeError: any) {
        console.error('GitHub write error for experience:', writeError);
        return res.status(500).json({
          success: false,
          message: 'Failed to save experience data to GitHub',
          error: writeError?.message || 'GitHub write operation failed'
        });
      }
    }

    // Handle education operations
    if (type === 'education') {
      if (!resumeData.education) resumeData.education = [];

      if (req.method === "GET") {
        return res.status(200).json({
          success: true,
          data: resumeData.education,
          timestamp: new Date().toISOString()
        });
      } else if (req.method === "POST") {
        resumeData.education.push(req.body);
      } else if (req.method === "PUT" && id) {
        const index = resumeData.education.findIndex((edu: any) => edu.id === parseInt(id as string));
        if (index !== -1) {
          resumeData.education[index] = { ...resumeData.education[index], ...req.body };
        }
      } else if (req.method === "DELETE" && id) {
        resumeData.education = resumeData.education.filter((edu: any) => edu.id !== parseInt(id as string));
      }

      // Save updated data to GitHub
      try {
        const result = await githubStorage.writeResumeData(resumeData);
        
        if (result.success) {
      return res.status(200).json({
        success: true,
            message: 'Education operation completed in GitHub',
            commit: result.commit,
        timestamp: new Date().toISOString()
      });
        } else {
          return res.status(500).json({
            success: false,
            message: 'Failed to save education data to GitHub',
            error: result.error
          });
        }
      } catch (writeError: any) {
        console.error('GitHub write error for education:', writeError);
        return res.status(500).json({
          success: false,
          message: 'Failed to save education data to GitHub',
          error: writeError?.message || 'GitHub write operation failed'
        });
      }
    }

    // Handle certifications operations
    if (type === 'certifications') {
      if (!resumeData.certifications) resumeData.certifications = [];

      if (req.method === "GET") {
        return res.status(200).json({
          success: true,
          data: resumeData.certifications,
          timestamp: new Date().toISOString()
        });
      } else if (req.method === "POST") {
        resumeData.certifications.push(req.body);
      } else if (req.method === "PUT" && id) {
        const index = resumeData.certifications.findIndex((cert: any) => cert.id === parseInt(id as string));
        if (index !== -1) {
          resumeData.certifications[index] = { ...resumeData.certifications[index], ...req.body };
        }
      } else if (req.method === "DELETE" && id) {
        resumeData.certifications = resumeData.certifications.filter((cert: any) => cert.id !== parseInt(id as string));
      }

      // Save updated data to GitHub
      try {
        const result = await githubStorage.writeResumeData(resumeData);
        
        if (result.success) {
      return res.status(200).json({
        success: true,
            message: 'Certifications operation completed in GitHub',
            commit: result.commit,
        timestamp: new Date().toISOString()
      });
        } else {
          return res.status(500).json({
            success: false,
            message: 'Failed to save certifications data to GitHub',
            error: result.error
          });
        }
      } catch (writeError: any) {
        console.error('GitHub write error for certifications:', writeError);
        return res.status(500).json({
          success: false,
          message: 'Failed to save certifications data to GitHub',
          error: writeError?.message || 'GitHub write operation failed'
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid operation type'
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error?.message || String(error)
    });
  }
}
