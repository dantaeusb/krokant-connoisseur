import { Injectable, Logger } from "@nestjs/common";
import { TranslationServiceClient } from "@google-cloud/translate/build/src/v3";

@Injectable()
export class TranslationService {
  private readonly logger = new Logger("Translation/Service");

  googleTranslateClient: TranslationServiceClient;

  constructor() {
    this.googleTranslateClient = new TranslationServiceClient({
      keyFilename: "./krokant-connoisseur-chat-c383b4003ae7.json",
    });
  }

  public async translateText(
    text: string,
    targetLanguage = "en"
  ): Promise<string | null> {
    const projectId = "krokant-connoisseur-chat";
    const location = "global";

    const request = {
      parent: `projects/${projectId}/locations/${location}`,
      contents: [text],
      mimeType: "text/plain",
      targetLanguageCode: targetLanguage,
    };

    try {
      const [response] = await this.googleTranslateClient.translateText(
        request
      );
      return response.translations?.[0]?.translatedText || text;
    } catch (error) {
      this.logger.error("Translation error:", error);
      return null;
    }
  }
}
