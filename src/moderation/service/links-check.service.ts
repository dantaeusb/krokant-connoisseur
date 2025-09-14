import { Injectable } from "@nestjs/common";

@Injectable()
export class LinksCheckService {
  private urlRegex: RegExp = /https?:\/\/[^\s]+/g;

  public containsLinks(text: string): boolean {
    return this.urlRegex.test(text);
  }
}