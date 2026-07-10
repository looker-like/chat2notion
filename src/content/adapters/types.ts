// Platform adapter interface: each AI platform provides CSS selectors and
// patterns so the content script can locate messages and extract content.
export interface PlatformAdapter {
    id: string;
    aiName: string;
    hosts: string[];
    assistantSelectors: string[];
    userSelectors: string[];
    contentSelectors: string[];
    assistantArticlePattern: RegExp;
    userArticlePattern: RegExp;
    streamingSelectors: string[];
}
