#!/usr/bin/env node

import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ChromeExtensionsAPICrawler {
    constructor() {
        this.baseDir = join(__dirname, '..', '.cursor', 'rules');
        this.outputDir = join(this.baseDir, 'chrome-extension-docs');
        this.baseUrl = 'https://developer.chrome.com';
        this.crawledUrls = new Set();
        this.documentation = [];
        this.stats = {
            totalUrls: 0,
            successfulCrawls: 0,
            failedCrawls: 0,
            startTime: null,
            endTime: null
        };

        // All Chrome Extensions API endpoints to crawl
        this.apiEndpoints = [
            // Core APIs
            '/docs/extensions/reference/api/accessibilityFeatures',
            '/docs/extensions/reference/api/action',
            '/docs/extensions/reference/api/alarms',
            '/docs/extensions/reference/api/audio',
            '/docs/extensions/reference/api/bookmarks',
            '/docs/extensions/reference/api/browsingData',
            '/docs/extensions/reference/api/certificateProvider',
            '/docs/extensions/reference/api/commands',
            '/docs/extensions/reference/api/contentSettings',
            '/docs/extensions/reference/api/contextMenus',
            '/docs/extensions/reference/api/cookies',
            '/docs/extensions/reference/api/debugger',
            '/docs/extensions/reference/api/declarativeContent',
            '/docs/extensions/reference/api/declarativeNetRequest',
            '/docs/extensions/reference/api/desktopCapture',
            '/docs/extensions/reference/api/devtools/inspectedWindow',
            '/docs/extensions/reference/api/devtools/network',
            '/docs/extensions/reference/api/devtools/panels',
            '/docs/extensions/reference/api/devtools/performance',
            '/docs/extensions/reference/api/devtools/recorder',
            '/docs/extensions/reference/api/dns',
            '/docs/extensions/reference/api/documentScan',
            '/docs/extensions/reference/api/dom',
            '/docs/extensions/reference/api/downloads',
            '/docs/extensions/reference/api/enterprise/deviceAttributes',
            '/docs/extensions/reference/api/enterprise/hardwarePlatform',
            '/docs/extensions/reference/api/enterprise/login',
            '/docs/extensions/reference/api/enterprise/networkingAttributes',
            '/docs/extensions/reference/api/enterprise/platformKeys',
            '/docs/extensions/reference/api/events',
            '/docs/extensions/reference/api/extension',
            '/docs/extensions/reference/api/extensionTypes',
            '/docs/extensions/reference/api/fileBrowserHandler',
            '/docs/extensions/reference/api/fileSystemProvider',
            '/docs/extensions/reference/api/fontSettings',
            '/docs/extensions/reference/api/gcm',
            '/docs/extensions/reference/api/history',
            '/docs/extensions/reference/api/i18n',
            '/docs/extensions/reference/api/identity',
            '/docs/extensions/reference/api/idle',
            '/docs/extensions/reference/api/input/ime',
            '/docs/extensions/reference/api/instanceID',
            '/docs/extensions/reference/api/loginState',
            '/docs/extensions/reference/api/management',
            '/docs/extensions/reference/api/notifications',
            '/docs/extensions/reference/api/offscreen',
            '/docs/extensions/reference/api/omnibox',
            '/docs/extensions/reference/api/pageCapture',
            '/docs/extensions/reference/api/permissions',
            '/docs/extensions/reference/api/platformKeys',
            '/docs/extensions/reference/api/power',
            '/docs/extensions/reference/api/printerProvider',
            '/docs/extensions/reference/api/printing',
            '/docs/extensions/reference/api/printingMetrics',
            '/docs/extensions/reference/api/privacy',
            '/docs/extensions/reference/api/processes',
            '/docs/extensions/reference/api/proxy',
            '/docs/extensions/reference/api/readingList',
            '/docs/extensions/reference/api/runtime',
            '/docs/extensions/reference/api/scripting',
            '/docs/extensions/reference/api/search',
            '/docs/extensions/reference/api/sessions',
            '/docs/extensions/reference/api/sidePanel',
            '/docs/extensions/reference/api/storage',
            '/docs/extensions/reference/api/system/cpu',
            '/docs/extensions/reference/api/system/display',
            '/docs/extensions/reference/api/system/memory',
            '/docs/extensions/reference/api/system/storage',
            '/docs/extensions/reference/api/systemLog',
            '/docs/extensions/reference/api/tabCapture',
            '/docs/extensions/reference/api/tabGroups',
            '/docs/extensions/reference/api/tabs',
            '/docs/extensions/reference/api/topSites',
            '/docs/extensions/reference/api/tts',
            '/docs/extensions/reference/api/ttsEngine',
            '/docs/extensions/reference/api/types',
            '/docs/extensions/reference/api/userScripts',
            '/docs/extensions/reference/api/vpnProvider',
            '/docs/extensions/reference/api/wallpaper',
            '/docs/extensions/reference/api/webAuthenticationProxy',
            '/docs/extensions/reference/api/webNavigation',
            '/docs/extensions/reference/api/webRequest',
            '/docs/extensions/reference/api/windows'
        ];
    }

    // Clean and decode HTML content
    cleanContent(text) {
        if (!text) return '';

        return text
            .replace(/&nbsp;/g, ' ')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Extract clean text content from HTML using proper parsing
    extractTextContent(html, selector) {
        try {
            // Use more intelligent regex patterns for specific content
            if (selector === 'h1') {
                const match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
                return match ? this.cleanContent(match[1]) : '';
            }
            
            if (selector === 'description') {
                // Look for meta description or first meaningful paragraph
                const metaMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
                if (metaMatch) return this.cleanContent(metaMatch[1]);
                
                // Look for first paragraph in devsite-content
                const pMatch = html.match(/<div class="dcc-reference">[^<]*<p>([^<]+)<\/p>/i);
                if (pMatch) return this.cleanContent(pMatch[1]);
                
                // Fallback: look for any paragraph in the main content area
                const fallbackMatch = html.match(/<div class="clearfix devsite-article-body">[^<]*<p>([^<]+)<\/p>/i);
                if (fallbackMatch) return this.cleanContent(fallbackMatch[1]);
                
                return '';
            }

            if (selector === 'methods') {
                // Extract method signatures from the page
                const methodMatches = html.match(/chrome\.[a-zA-Z]+\.[a-zA-Z]+\([^)]*\)/gi);
                if (methodMatches) {
                    return [...new Set(methodMatches)].map(m => this.cleanContent(m));
                }
                
                // Fallback: look for method names in headings
                const methodHeadingMatches = html.match(/<h[2-6][^>]*>([^<]*method[^<]*)<\/h[2-6]>/gi);
                if (methodHeadingMatches) {
                    return methodHeadingMatches.map(h => this.cleanContent(h.replace(/<[^>]*>/g, '')));
                }
                
                return [];
            }

            if (selector === 'properties') {
                // Extract actual API properties, not CSS properties
                const propMatches = html.match(/<div class="dcc-code-sections__label"[^>]*>([^<]+)<\/div>/gi);
                if (propMatches) {
                    return propMatches.map(p => this.cleanContent(p.replace(/<[^>]*>/g, '')));
                }
                
                // Fallback: look for property-like patterns in the content
                const fallbackMatches = html.match(/<strong>([^<]+)<\/strong>/gi);
                if (fallbackMatches) {
                    return fallbackMatches.map(p => this.cleanContent(p.replace(/<[^>]*>/g, '')));
                }
                
                return [];
            }

            if (selector === 'codeExamples') {
                // Extract code examples from pre tags
                const codeMatches = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/gi);
                if (codeMatches) {
                    return codeMatches.map(code => this.cleanContent(code.replace(/<[^>]*>/g, '')));
                }
                
                // Fallback: look for code blocks in devsite-code
                const devsiteCodeMatches = html.match(/<devsite-code[^>]*>([\s\S]*?)<\/devsite-code>/gi);
                if (devsiteCodeMatches) {
                    return devsiteCodeMatches.map(code => this.cleanContent(code.replace(/<[^>]*>/g, '')));
                }
                
                return [];
            }

            if (selector === 'sections') {
                // Extract section headings
                const headingMatches = html.match(/<h[2-6][^>]*>([^<]+)<\/h[2-6]>/gi);
                if (headingMatches) {
                    return headingMatches.map(h => this.cleanContent(h.replace(/<[^>]*>/g, '')));
                }
                return [];
            }

            return '';
        } catch (error) {
            console.log(`⚠️  Error extracting ${selector}: ${error.message}`);
            return '';
        }
    }

    // Extract main content with intelligent parsing
    extractMainContent(html, url) {
        const content = {
            title: '',
            description: '',
            sections: [],
            codeExamples: [],
            apiMethods: [],
            properties: [],
            permissions: [],
            examples: []
        };

        try {
            // Extract title from h1
            content.title = this.extractTextContent(html, 'h1');

            // Extract description
            content.description = this.extractTextContent(html, 'description');

            // Extract sections
            content.sections = this.extractTextContent(html, 'sections');

            // Extract code examples
            content.codeExamples = this.extractTextContent(html, 'codeExamples');

            // Extract API methods
            content.apiMethods = this.extractTextContent(html, 'methods');

            // Extract properties
            content.properties = this.extractTextContent(html, 'properties');

            // Extract permissions from manifest examples
            const permMatches = html.match(/"permissions"\s*:\s*\[([^\]]+)\]/gi);
            if (permMatches) {
                content.permissions = permMatches.map(p => this.cleanContent(p));
            }

            // Extract examples from code blocks
            const exampleMatches = html.match(/<code[^>]*>([^<]+)<\/code>/gi);
            if (exampleMatches) {
                content.examples = exampleMatches.map(ex => this.cleanContent(ex.replace(/<[^>]*>/g, '')));
            }

        } catch (error) {
            console.log(`⚠️  Error extracting content: ${error.message}`);
        }

        return content;
    }

    // Generate clean markdown with frontmatter
    generateMarkdown(url, content, endpoint) {
        const timestamp = new Date().toISOString();
        const fileName = this.generateFileName(endpoint);

        // Generate frontmatter
        let frontmatter = `---\n`;
        frontmatter += `title: "${content.title || 'Chrome Extensions API'}"\n`;
        frontmatter += `url: "${url}"\n`;
        frontmatter += `endpoint: "${endpoint}"\n`;
        frontmatter += `crawled: "${timestamp}"\n`;
        frontmatter += `category: "Chrome Extensions API"\n`;
        frontmatter += `tags: ["chrome", "extensions", "api", "reference"]\n`;

        if (content.description) {
            frontmatter += `description: "${content.description}"\n`;
        }

        if (content.permissions && content.permissions.length > 0) {
            frontmatter += `permissions: ${JSON.stringify(content.permissions)}\n`;
        }

        frontmatter += `---\n\n`;

        let markdown = frontmatter;

        // Add title
        markdown += `# ${content.title || 'Chrome Extensions API'}\n\n`;

        // Add description
        if (content.description) {
            markdown += `## 📖 Description\n\n${content.description}\n\n`;
        }

        // Add sections
        if (content.sections && content.sections.length > 0) {
            markdown += `## 📋 Content Sections\n\n`;
            content.sections.forEach((section, index) => {
                markdown += `${index + 1}. **${section}**\n`;
            });
            markdown += '\n';
        }

        // Add API methods
        if (content.apiMethods && content.apiMethods.length > 0) {
            markdown += `## 🔧 API Methods\n\n`;
            content.apiMethods.forEach(method => {
                markdown += `- \`${method}\`\n`;
            });
            markdown += '\n';
        }

        // Add properties
        if (content.properties && content.properties.length > 0) {
            markdown += `## 📝 Properties\n\n`;
            content.properties.forEach(prop => {
                markdown += `- \`${prop}\`\n`;
            });
            markdown += '\n';
        }

        // Add permissions
        if (content.permissions && content.permissions.length > 0) {
            markdown += `## 🔐 Permissions\n\n`;
            content.permissions.forEach(perm => {
                markdown += `- ${perm}\n`;
            });
            markdown += '\n';
        }

        // Add code examples
        if (content.codeExamples && content.codeExamples.length > 0) {
            markdown += `## 💻 Code Examples\n\n`;
            content.codeExamples.forEach((example, index) => {
                markdown += `### Example ${index + 1}\n\n`;
                markdown += '```javascript\n';
                markdown += example + '\n';
                markdown += '```\n\n';
            });
        }

        // Add examples
        if (content.examples && content.examples.length > 0) {
            markdown += `## 📚 Examples\n\n`;
            content.examples.forEach((example, index) => {
                markdown += `${index + 1}. \`${example}\`\n`;
            });
            markdown += '\n';
        }

        // Add navigation
        markdown += `## 🔗 Navigation\n\n`;
        markdown += `- [← Back to API Index](./README.md)\n`;
        markdown += `- [← Back to Summary](./SUMMARY.md)\n`;
        markdown += `- [📊 View Crawl Stats](./CRAWL_STATS.md)\n\n`;
        markdown += '---\n';
        markdown += '*Generated by Chrome Extensions API Crawler*\n';

        return { fileName, markdown };
    }

    // Generate clean filename
    generateFileName(endpoint) {
        try {
            const pathParts = endpoint.split('/').filter(Boolean);
            const lastPart = pathParts[pathParts.length - 1] || 'index';

            let fileName = lastPart
                .replace(/[^a-zA-Z0-9]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');

            if (!fileName) fileName = 'index';

            return `${fileName}.md`;
        } catch (error) {
            return 'documentation.md';
        }
    }

    // Crawl URL with improved content extraction
    async crawlUrl(endpoint) {
        const url = this.baseUrl + endpoint;

        if (this.crawledUrls.has(url)) {
            return;
        }

        this.crawledUrls.add(url);
        this.stats.totalUrls++;
        console.log(`🔍 Crawling: ${endpoint}`);

        try {
            // Use curl with English locale to avoid language issues
            const response = execSync(`curl -s -L -H "Accept-Language: en-US,en;q=0.9" "${url}"`, {
                encoding: 'utf8',
                timeout: 30000
            });

            if (!response) {
                console.log(`⚠️  No content received from ${endpoint}`);
                this.stats.failedCrawls++;
                return;
            }

            // Extract main content with intelligent parsing
            const mainContent = this.extractMainContent(response, url);

            // Debug output to see what was extracted
            console.log(`🔍 Debug - ${endpoint}:`);
            console.log(`   Title: "${mainContent.title}"`);
            console.log(`   Description: "${mainContent.description}"`);
            console.log(`   Sections: ${mainContent.sections.length}`);
            console.log(`   Methods: ${mainContent.apiMethods.length}`);
            console.log(`   Properties: ${mainContent.properties.length}`);
            console.log(`   Code Examples: ${mainContent.codeExamples.length}`);

            // More flexible validation - accept content if we have ANY meaningful data
            if (mainContent.title || mainContent.description || mainContent.sections.length > 0 || 
                mainContent.apiMethods.length > 0 || mainContent.properties.length > 0 || 
                mainContent.codeExamples.length > 0) {
                
                // Generate clean markdown
                const { fileName, markdown } = this.generateMarkdown(url, mainContent, endpoint);

                // Save to documentation array
                this.documentation.push({
                    url,
                    fileName,
                    endpoint,
                    content: mainContent,
                    markdown
                });

                // Write the file immediately
                await this.writeFile(fileName, markdown);

                this.stats.successfulCrawls++;
                console.log(`✅ Extracted & Saved: ${fileName}`);
            } else {
                console.log(`⚠️  No meaningful content extracted from ${endpoint}`);
                this.stats.failedCrawls++;
            }

        } catch (error) {
            console.log(`❌ Error crawling ${endpoint}: ${error.message}`);
            this.stats.failedCrawls++;
        }
    }

    // Write individual file immediately
    async writeFile(fileName, markdown) {
        try {
            const filePath = join(this.outputDir, fileName);
            await fs.writeFile(filePath, markdown, 'utf8');
        } catch (error) {
            console.error(`❌ Error writing ${fileName}: ${error.message}`);
            throw error;
        }
    }

    // Generate comprehensive README
    generateReadme() {
        const timestamp = new Date().toLocaleString();

        let readme = `# Chrome Extensions API Reference\n\n`;
        readme += `> Generated on: ${timestamp}\n`;
        readme += `> Crawler: Chrome Extensions API Crawler v2.0\n\n`;

        readme += `## 🎯 Overview\n\n`;
        readme += `This documentation contains the complete Chrome Extensions API reference, automatically crawled from the official Chrome Developer documentation.\n\n`;

        readme += `## 📊 Crawl Statistics\n\n`;
        readme += `| Metric | Value |\n`;
        readme += `|--------|-------|\n`;
        readme += `| **Total APIs** | ${this.apiEndpoints.length} |\n`;
        readme += `| **Successfully Crawled** | ${this.stats.successfulCrawls} |\n`;
        readme += `| **Failed Crawls** | ${this.stats.failedCrawls} |\n`;
        readme += `| **Success Rate** | ${((this.stats.successfulCrawls / this.stats.totalUrls) * 100).toFixed(1)}% |\n\n`;

        readme += `## 🌐 Source\n\n`;
        readme += `- **Base URL**: [Chrome Extensions API Reference](https://developer.chrome.com/docs/extensions/reference/api)\n`;
        readme += `- **Documentation**: Official Chrome Developer Documentation\n`;
        readme += `- **Last Updated**: ${timestamp}\n\n`;

        readme += `## 📚 API Reference Index\n\n`;

        // Group APIs by category
        const categories = {
            'Browser & Tabs': ['action', 'tabs', 'windows', 'tabGroups', 'tabCapture', 'pageCapture'],
            'Storage & Data': ['storage', 'cookies', 'bookmarks', 'history', 'downloads', 'browsingData'],
            'Network & Web': ['webRequest', 'webNavigation', 'declarativeNetRequest', 'proxy', 'dns'],
            'System & Hardware': ['system/cpu', 'system/memory', 'system/display', 'system/storage', 'power', 'idle'],
            'Media & Input': ['audio', 'desktopCapture', 'input/ime', 'tts', 'ttsEngine'],
            'Security & Identity': ['identity', 'certificateProvider', 'platformKeys', 'webAuthenticationProxy'],
            'Development Tools': ['devtools/inspectedWindow', 'devtools/panels', 'devtools/network', 'devtools/performance', 'devtools/recorder', 'debugger'],
            'Communication & Events': ['runtime', 'messaging', 'events', 'alarms', 'commands'],
            'UI & Interface': ['contextMenus', 'omnibox', 'notifications', 'sidePanel', 'offscreen'],
            'Enterprise & Advanced': ['enterprise/deviceAttributes', 'enterprise/hardwarePlatform', 'enterprise/login', 'enterprise/networkingAttributes', 'enterprise/platformKeys'],
            'File & Content': ['fileSystemProvider', 'fileBrowserHandler', 'documentScan', 'printing', 'printerProvider'],
            'Utilities & Services': ['i18n', 'fontSettings', 'gcm', 'readingList', 'search', 'sessions', 'vpnProvider', 'wallpaper']
        };

        Object.entries(categories).forEach(([category, apis]) => {
            readme += `### ${category}\n\n`;
            apis.forEach(api => {
                const doc = this.documentation.find(d => d.endpoint.includes(api));
                if (doc) {
                    readme += `- [${doc.content.title || api}](./${doc.fileName}) - ${doc.content.description || 'API documentation'}\n`;
                } else {
                    readme += `- [${api}](./${api.split('/').pop()}.md) - API documentation\n`;
                }
            });
            readme += '\n';
        });

        readme += `## 🚀 Usage\n\n`;
        readme += `This documentation was automatically generated and includes:\n\n`;
        readme += `- **Complete API Coverage**: All ${this.apiEndpoints.length} Chrome Extensions APIs\n`;
        readme += `- **Clean Markdown**: Professionally formatted with frontmatter\n`;
        readme += `- **Content Extraction**: Intelligent parsing of API documentation\n`;
        readme += `- **Navigation**: Cross-references between all API pages\n`;
        readme += `- **Examples**: Code examples and usage patterns\n\n`;

        readme += '---\n';
        readme += '*Generated by Chrome Extensions API Crawler v2.0*\n';

        return readme;
    }

    // Generate summary file
    generateSummary() {
        let summary = `# Chrome Extensions API Summary\n\n`;
        summary += `## 📋 Overview\n`;
        summary += `This documentation contains **${this.documentation.length}** Chrome Extensions API references.\n\n`;

        summary += `## 📚 API Index\n\n`;
        this.documentation.forEach((doc, index) => {
            const title = doc.content.title || doc.endpoint.split('/').pop();
            summary += `${index + 1}. **[${title}](./${doc.fileName})**\n`;
        });
        summary += '\n';

        summary += `## 📊 Quick Stats\n`;
        summary += `- **Total APIs**: ${this.documentation.length}\n`;
        summary += `- **Generation Date**: ${new Date().toLocaleString()}\n`;
        summary += `- **Success Rate**: ${((this.stats.successfulCrawls / this.stats.totalUrls) * 100).toFixed(1)}%\n\n`;

        summary += '---\n';
        summary += `[← Back to Main](./README.md) | [📊 View Stats](./CRAWL_STATS.md)\n\n`;
        summary += '*Generated by Chrome Extensions API Crawler v2.0*\n';

        return summary;
    }

    // Generate crawl statistics
    generateCrawlStats() {
        let stats = `# Crawl Statistics\n\n`;
        stats += `## 📊 Performance Metrics\n\n`;
        stats += `| Metric | Value |\n`;
        stats += `|--------|-------|\n`;
        stats += `| **Total APIs** | ${this.apiEndpoints.length} |\n`;
        stats += `| **Successfully Crawled** | ${this.stats.successfulCrawls} |\n`;
        stats += `| **Failed Crawls** | ${this.stats.failedCrawls} |\n`;
        stats += `| **Success Rate** | ${((this.stats.successfulCrawls / this.stats.totalUrls) * 100).toFixed(1)}% |\n\n`;

        if (this.stats.startTime && this.stats.endTime) {
            stats += `## ⏱️ Timing Information\n\n`;
            stats += `- **Start Time**: ${this.stats.startTime.toLocaleString()}\n`;
            stats += `- **End Time**: ${this.stats.endTime.toLocaleString()}\n`;
            const duration = (this.stats.endTime - this.stats.startTime) / 1000;
            stats += `- **Duration**: ${duration.toFixed(2)} seconds\n\n`;
        }

        stats += `## 🔍 API Coverage\n\n`;
        stats += `### Successfully Crawled APIs\n`;
        this.documentation.forEach(doc => {
            stats += `- ✅ ${doc.endpoint} - ${doc.content.title || 'Untitled'}\n`;
        });
        stats += '\n';

        if (this.stats.failedCrawls > 0) {
            stats += `### Failed Crawls\n`;
            stats += `- ❌ ${this.stats.failedCrawls} APIs failed to crawl\n\n`;
        }

        stats += '---\n';
        stats += `[← Back to Main](./README.md) | [📚 View Summary](./SUMMARY.md)\n\n`;
        stats += '*Generated by Chrome Extensions API Crawler v2.0*\n';

        return stats;
    }

    // Save documentation files
    async saveDocumentation() {
        try {
            // Create output directory if it doesn't exist
            await fs.mkdir(this.outputDir, { recursive: true });

            // Generate and save README
            const readme = this.generateReadme();
            await fs.writeFile(join(this.outputDir, 'README.md'), readme, 'utf8');
            console.log(`📝 Saved: README.md`);

            // Generate and save SUMMARY
            const summary = this.generateSummary();
            await fs.writeFile(join(this.outputDir, 'SUMMARY.md'), summary, 'utf8');
            console.log(`📝 Saved: SUMMARY.md`);

            // Generate and save CRAWL_STATS
            const crawlStats = this.generateCrawlStats();
            await fs.writeFile(join(this.outputDir, 'CRAWL_STATS.md'), crawlStats, 'utf8');
            console.log(`📝 Saved: CRAWL_STATS.md`);

            console.log(`\n✅ Documentation generation completed!`);
            console.log(`📊 Total APIs crawled: ${this.documentation.length}`);
            console.log(`📁 Total files created: ${this.documentation.length + 3}`);

        } catch (error) {
            console.error(`❌ Error saving documentation: ${error.message}`);
            throw error;
        }
    }

    // Main crawling method
    async crawl() {
        this.stats.startTime = new Date();

        console.log('🚀 Chrome Extensions API Crawler v2.0');
        console.log('=====================================\n');
        console.log(`🎯 Target: ${this.apiEndpoints.length} Chrome Extensions APIs`);
        console.log(`📁 Output: ${this.outputDir}\n`);

        try {
            // Crawl all API endpoints
            for (const endpoint of this.apiEndpoints) {
                await this.crawlUrl(endpoint);

                // Small delay to be respectful
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Generate documentation
            console.log('\n📝 Generating documentation...\n');
            await this.saveDocumentation();

            this.stats.endTime = new Date();

            console.log('\n🎉 Crawling completed successfully!');
            console.log(`📊 Final Stats:`);
            console.log(`   - Total APIs: ${this.apiEndpoints.length}`);
            console.log(`   - Successfully Crawled: ${this.stats.successfulCrawls}`);
            console.log(`   - Failed: ${this.stats.failedCrawls}`);
            console.log(`   - Success Rate: ${((this.stats.successfulCrawls / this.stats.totalUrls) * 100).toFixed(1)}%`);

        } catch (error) {
            console.error(`❌ Crawling failed: ${error.message}`);
            throw error;
        }
    }
}

// Run the crawler
const crawler = new ChromeExtensionsAPICrawler();
crawler.crawl().catch(console.error);
