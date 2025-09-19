import { Injectable } from "@nestjs/common";

@Injectable()
export class FormatterService {
  public escapeMarkdownV2(text: string): string {
    return text.replace(/([#+=|{}\(\)\[\]])/gm, "\\$1");
  }
}