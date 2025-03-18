import {
	ApplicationError,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

// Debug parameters interface
interface DebugOptions {
	slowMo: number;
	devtools: boolean;
	waitAfterTranscript: boolean;
	debuggerStatement: boolean;
	headless: boolean;
}

export class YoutubeTranscriptNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Youtube Transcript',
		name: 'youtubeTranscriptNode',
		// eslint-disable-next-line n8n-nodes-base/node-class-description-icon-not-svg
		icon: 'file:youTube.png',
		group: ['transform'],
		version: 1,
		description: 'Get Transcript of a youtube video',
		defaults: {
			name: 'Youtube Transcript',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Youtube Video ID or Url',
				name: 'youtubeId',
				type: 'string',
				default: '',
				placeholder: 'Youtube Video ID or Url',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Debug Mode',
						name: 'debugMode',
						type: 'boolean',
						default: false,
						description: 'Whether to enable debug mode',
					},
					{
						displayName: 'Open DevTools',
						name: 'devtools',
						type: 'boolean',
						default: false,
						description: 'Whether to open Chrome DevTools automatically',
						displayOptions: {
							show: {
								debugMode: [true],
							},
						},
					},
					{
						displayName: 'Slow Motion',
						name: 'slowMo',
						type: 'boolean',
						default: false,
						description: 'Whether to slow down Puppeteer operations for better visibility',
						displayOptions: {
							show: {
								debugMode: [true],
							},
						},
					},
					{
						displayName: 'Use Debugger Statement',
						name: 'debuggerStatement',
						type: 'boolean',
						default: false,
						description: 'Whether to pause at debugger statement before transcript processing',
						displayOptions: {
							show: {
								debugMode: [true],
							},
						},
					},
					{
						displayName: 'Wait After Transcript',
						name: 'waitAfterTranscript',
						type: 'boolean',
						default: false,
						description: 'Whether to keep browser open after getting transcript for inspection',
						displayOptions: {
							show: {
								debugMode: [true],
							},
						},
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		puppeteer.use(StealthPlugin());
		
		// Define the methods here to avoid 'this' context issues
		const getDebugOptions = (executeFunctions: IExecuteFunctions): DebugOptions => {
			const options = executeFunctions.getNodeParameter('options', 0, {}) as {
				debugMode?: boolean;
				slowMo?: boolean;
				devtools?: boolean;
				waitAfterTranscript?: boolean;
				debuggerStatement?: boolean;
			};

			// Check for environment variables for standalone testing
			const isDebugMode = options.debugMode || process.argv.includes('--debug-mode');
			const isSlowMo = options.slowMo || process.argv.includes('--slow-mo');
			const isDevtools = options.devtools || process.argv.includes('--devtools');
			const isWaitAfter = options.waitAfterTranscript || process.argv.includes('--wait-after');
			const isDebuggerStatement = options.debuggerStatement || process.argv.includes('--debugger');
			
			// Only use the headless mode if we're not debugging
			const useHeadless = !isDebugMode && !process.argv.includes('--no-headless');

			return {
				slowMo: isSlowMo ? 100 : 0,
				devtools: isDevtools,
				waitAfterTranscript: isWaitAfter,
				debuggerStatement: isDebuggerStatement,
				headless: useHeadless,
			};
		};

		const getPuppeteerConfig = (debugOptions: DebugOptions): any => {
			return {
				headless: debugOptions.headless,
				devtools: debugOptions.devtools,
				slowMo: debugOptions.slowMo,
				args: [
					'--ignore-certificate-errors',
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-accelerated-2d-canvas',
					'--disable-gpu',
					'--window-size=1920,1080',  // Larger window for better debugging visibility
				],
				ignoreDefaultArgs: ['--enable-automation'],
			};
		};
		
		// Get debug options
		const debugOptions = getDebugOptions(this);
		
		if (debugOptions.slowMo || debugOptions.devtools || debugOptions.waitAfterTranscript || debugOptions.debuggerStatement) {
			console.log('🔍 Debug mode enabled with options:', debugOptions);
		}
		
		// Browser check with debug options
		const checkBrowserWorks = async () => {
			let browser: Browser | null = null;
			try {
				console.log('🔍 Testing browser launch with current settings...');
				browser = await puppeteer.launch(getPuppeteerConfig(debugOptions));
			} catch (error: any) {
				throw new ApplicationError(`Failed to launch the browser: ${error.message}`);
			} finally {
				if (browser) await browser.close();
			}
		};

		// Get transcript with debug options
		const getTranscriptFromYoutube = async (youtubeId: string) => {
			let browser: Browser | null = null;
			let page: Page | null = null;
			try {
				console.log(`🔍 Getting transcript for YouTube ID: ${youtubeId}`);
				browser = await puppeteer.launch(getPuppeteerConfig(debugOptions));

				page = await browser.newPage();

				const url = `https://www.youtube.com/watch?v=${youtubeId}`;
				console.log(`🌐 Navigating to ${url}`);
				await page.goto(url, { waitUntil: 'domcontentloaded' });

				console.log('🍪 Handling cookie consent dialog if present...');
				// Wait for cookie consent dialog to appear (if it exists)
				try {
					console.log('Waiting for cookie consent button to appear...');
					await page.waitForSelector('button[aria-label*="cookie"], button[aria-label*="cookies"], button[aria-label*="Cookie"], button[aria-label*="Cookies"]', {
						timeout: 5000,  // Wait up to 5 seconds for cookie dialog
						visible: true,
					});
					
					console.log('Cookie consent button found, clicking it...');
					await page.evaluate(() => {
						const cookieButton = document.querySelector<HTMLButtonElement>(
							'button[aria-label*="cookie"], button[aria-label*="cookies"], button[aria-label*="Cookie"], button[aria-label*="Cookies"]',
						);
						if (cookieButton) {
							console.log('Cookie button found, clicking it');
							cookieButton.click();
						}
					});
					
					// Wait a moment for the cookie dialog to disappear
					await new Promise(resolve => setTimeout(resolve, 1000));
				} catch (error) {
					console.log('No cookie consent dialog found or timed out waiting for it, continuing...');
				}

				// Add a debugger pause if requested
				if (debugOptions.debuggerStatement) {
					console.log('⏸️ Pausing with debugger statement before checking for transcript button');
					// eslint-disable-next-line no-debugger
					debugger;
				}

				console.log('🔍 Waiting for transcript button...');
				const transcriptButtonAvailable = await page
					.waitForSelector('ytd-video-description-transcript-section-renderer button', {
						timeout: debugOptions.waitAfterTranscript ? 30_000 : 10_000, // Longer timeout for debugging
					})
					.catch(() => {
						console.log('❌ Transcript button not found');
						return null;
					});

				if (!transcriptButtonAvailable) {
					throw new ApplicationError(
						`The video with ID ${youtubeId} either does not exist or does not have a transcript available. Please check the video URL or try again later.`,
					);
				}

				console.log('✅ Transcript button found, clicking it...');
				await page.evaluate(() => {
					const transcriptButton = document.querySelector<HTMLButtonElement>(
						'ytd-video-description-transcript-section-renderer button',
					);
					if (transcriptButton) {
						transcriptButton.click();
					} else {
						console.log('Transcript button disappeared');
					}
				});

				console.log('🔍 Waiting for transcript container...');
				await page.waitForSelector('#segments-container', { 
					timeout: debugOptions.waitAfterTranscript ? 30_000 : 10_000 
				});

				console.log('🔍 Extracting transcript...');
				const transcript = await page.evaluate(() => {
					// Get all segment renderer elements
					const segments = Array.from(document.querySelectorAll('ytd-transcript-segment-renderer'));
					
					// Extract timestamp and text from each segment
					return segments.map(segment => {
						const timestampElement = segment.querySelector('.segment-timestamp');
						const textElement = segment.querySelector('.segment-text');
						
						const timestamp = timestampElement ? timestampElement.textContent?.trim() : '';
						const text = textElement ? textElement.textContent?.trim() : '';
						
						return {
							timestamp,
							text,
							// Convert timestamp (like "0:05" or "1:23:45") to seconds for easier processing
							seconds: timestamp ? convertTimestampToSeconds(timestamp) : 0
						};
					}).filter(item => item.text !== '');
					
					// Helper function to convert timestamp strings to seconds
					function convertTimestampToSeconds(timestamp: string): number {
						const parts = timestamp.split(':').map(Number);
						
						if (parts.length === 3) {
							// Format: hours:minutes:seconds
							return parts[0] * 3600 + parts[1] * 60 + parts[2];
						} else if (parts.length === 2) {
							// Format: minutes:seconds
							return parts[0] * 60 + parts[1];
						} else if (parts.length === 1) {
							// Format: seconds only
							return parts[0];
						}
						
						return 0;
					}
				});

				console.log(`✅ Transcript extracted with ${transcript.length} segments`);
				return transcript;
			} catch (error) {
				if (error instanceof ApplicationError) {
					throw error;
				} else {
					throw new ApplicationError(`Failed to extract transcript: ${error.message}`);
				}
			} finally {
				if (!debugOptions.waitAfterTranscript) {
					if (page) await page.close();
					if (browser) await browser.close();
				} else {
					console.log('🔍 DEBUG: Browser will remain open for inspection (wait-after enabled)');
					console.log('Press Ctrl+C to exit when finished debugging.');
					// Keep process alive
					await new Promise(() => {});
				}
			}
		};

		try {
			await checkBrowserWorks();
		} catch (error: any) {
			throw new NodeOperationError(this.getNode(), error, {
				message: 'Failed to launch the browser before processing.',
			});
		}

		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		let youtubeId: string;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				youtubeId = this.getNodeParameter('youtubeId', itemIndex, '') as string;

				const urlRegex = /^(http(s)?:\/\/)?((w){3}.)?youtu(be|.be)?(\.com)?\/.+/;

				if (urlRegex.test(youtubeId)) {
					const url = new URL(youtubeId);

					if (url.hostname === 'youtu.be') {
						youtubeId = url.pathname.slice(1); // Extract the video ID from the path
					} else {
						const v = url.searchParams.get('v');
						if (!v) {
							throw new ApplicationError(
								`The provided URL doesn't contain a valid YouTube video identifier. URL: ${youtubeId}`,
							);
						}
						youtubeId = v;
					}
				}

				const transcript = await getTranscriptFromYoutube(youtubeId);

				returnData.push({
					json: {
						youtubeId,
						// Include the full transcript with timestamps and seconds
						transcript: transcript
					},
					pairedItem: { item: itemIndex },
				});
			} catch (error: any) {
				if (this.continueOnFail()) {
					items.push({ json: this.getInputData(itemIndex)[0].json, error, pairedItem: itemIndex });
				} else {
					if (error.context) {
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}
}
