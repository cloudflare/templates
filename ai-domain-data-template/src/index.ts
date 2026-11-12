/**
 * Cloudflare Worker for AI Domain Data Standard
 * 
 * Serves domain-profile.json at /.well-known/domain-profile.json
 * 
 * Configuration via environment variables:
 * - AIDD_SPEC: Spec version URL (default: https://ai-domain-data.org/spec/v0.1)
 * - AIDD_NAME: Required - Site/organization name
 * - AIDD_DESCRIPTION: Required - Description
 * - AIDD_WEBSITE: Required - Website URL
 * - AIDD_CONTACT: Required - Contact email or URL
 * - AIDD_LOGO: Optional - Logo URL
 * - AIDD_ENTITY_TYPE: Optional - Entity type (Organization, Person, Blog, etc.)
 * - AIDD_JSONLD: Optional - JSON-LD object as JSON string
 * 
 * Optional: Use KV namespace "AIDD" with key "profile" to store JSON directly
 */

interface DomainProfile {
  spec: string;
  name: string;
  description: string;
  website: string;
  contact: string;
  logo?: string;
  entity_type?: string;
  jsonld?: object;
}

interface Env {
  AIDD_SPEC?: string;
  AIDD_NAME?: string;
  AIDD_DESCRIPTION?: string;
  AIDD_WEBSITE?: string;
  AIDD_CONTACT?: string;
  AIDD_LOGO?: string;
  AIDD_ENTITY_TYPE?: string;
  AIDD_JSONLD?: string;
  AIDD?: KVNamespace; // Optional KV namespace
}

/**
 * Validates a domain profile against the AIDD schema
 */
function validateProfile(profile: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (!profile.spec || typeof profile.spec !== 'string') {
    errors.push('Missing or invalid "spec" field');
  }
  if (!profile.name || typeof profile.name !== 'string' || profile.name.trim().length === 0) {
    errors.push('Missing or invalid "name" field');
  }
  if (!profile.description || typeof profile.description !== 'string' || profile.description.trim().length === 0) {
    errors.push('Missing or invalid "description" field');
  }
  if (!profile.website || typeof profile.website !== 'string') {
    errors.push('Missing or invalid "website" field');
  } else {
    try {
      new URL(profile.website);
    } catch {
      errors.push('Invalid "website" URL format');
    }
  }
  if (!profile.contact || typeof profile.contact !== 'string' || profile.contact.trim().length === 0) {
    errors.push('Missing or invalid "contact" field');
  }

  // Optional fields validation
  if (profile.logo !== undefined) {
    if (typeof profile.logo !== 'string') {
      errors.push('Invalid "logo" field (must be string)');
    } else {
      try {
        new URL(profile.logo);
      } catch {
        errors.push('Invalid "logo" URL format');
      }
    }
  }

  if (profile.entity_type !== undefined) {
    const validTypes = [
      'Organization',
      'Person',
      'Blog',
      'NGO',
      'Community',
      'Project',
      'CreativeWork',
      'SoftwareApplication',
      'Thing'
    ];
    if (!validTypes.includes(profile.entity_type)) {
      errors.push(`Invalid "entity_type" (must be one of: ${validTypes.join(', ')})`);
    }
  }

  if (profile.jsonld !== undefined) {
    if (typeof profile.jsonld !== 'object' || Array.isArray(profile.jsonld) || profile.jsonld === null) {
      errors.push('Invalid "jsonld" field (must be an object)');
    }
  }

  // Check for additional properties
  const allowedKeys = ['spec', 'name', 'description', 'website', 'logo', 'contact', 'entity_type', 'jsonld'];
  const profileKeys = Object.keys(profile);
  const extraKeys = profileKeys.filter(key => !allowedKeys.includes(key));
  if (extraKeys.length > 0) {
    errors.push(`Additional properties not allowed: ${extraKeys.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Builds domain profile from environment variables
 */
function buildProfileFromEnv(env: Env): DomainProfile | null {
  if (!env.AIDD_NAME || !env.AIDD_DESCRIPTION || !env.AIDD_WEBSITE || !env.AIDD_CONTACT) {
    return null;
  }

  const profile: DomainProfile = {
    spec: env.AIDD_SPEC || 'https://ai-domain-data.org/spec/v0.1',
    name: env.AIDD_NAME,
    description: env.AIDD_DESCRIPTION,
    website: env.AIDD_WEBSITE,
    contact: env.AIDD_CONTACT
  };

  if (env.AIDD_LOGO) {
    profile.logo = env.AIDD_LOGO;
  }

  if (env.AIDD_ENTITY_TYPE) {
    profile.entity_type = env.AIDD_ENTITY_TYPE;
  }

  if (env.AIDD_JSONLD) {
    try {
      profile.jsonld = JSON.parse(env.AIDD_JSONLD);
    } catch (e) {
      // Invalid JSON-LD, skip it
      console.error('Failed to parse AIDD_JSONLD:', e);
    }
  }

  return profile;
}

/**
 * Main request handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Only handle the domain-profile.json path
    if (url.pathname !== '/.well-known/domain-profile.json') {
      return new Response('Not Found', { status: 404 });
    }

    // Handle OPTIONS for CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { 
        status: 405,
        headers: {
          'Allow': 'GET, OPTIONS',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    let profile: DomainProfile | null = null;

    // Try to get from KV first (if configured)
    if (env.AIDD) {
      try {
        const kvData = await env.AIDD.get('profile', 'json');
        if (kvData) {
          profile = kvData as DomainProfile;
        }
      } catch (e) {
        console.error('Failed to read from KV:', e);
        // Fall through to env vars
      }
    }

    // Fall back to environment variables
    if (!profile) {
      profile = buildProfileFromEnv(env);
    }

    if (!profile) {
      return new Response(
        JSON.stringify({
          error: 'Domain profile not configured',
          message: 'Please set AIDD_NAME, AIDD_DESCRIPTION, AIDD_WEBSITE, and AIDD_CONTACT environment variables, or store profile in KV namespace "AIDD" with key "profile".'
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // Validate the profile
    const validation = validateProfile(profile);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({
          error: 'Invalid domain profile',
          errors: validation.errors
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        }
      );
    }

    // Return the profile
    return new Response(JSON.stringify(profile, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
};

