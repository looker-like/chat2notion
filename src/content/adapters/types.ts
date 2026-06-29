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
