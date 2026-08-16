import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphAccessToken } from "./authProvider";
 
/**
 * Khởi tạo Microsoft Graph client dùng custom auth provider,
 * tự gắn access token vào mỗi request tới Graph API.
 *
 * Không dùng singleton toàn cục vì token có thể hết hạn giữa các lần
 * gọi trong môi trường serverless (mỗi lần gọi getClient() sẽ tự
 * lấy token còn hạn hoặc refresh nếu cần, nhờ cache trong authProvider).
 */
export function getGraphClient(): Client {
  return Client.init({
    authProvider: async (done) => {
      try {
        const token = await getGraphAccessToken();
        done(null, token);
      } catch (error) {
        done(error as Error, null);
      }
    },
  });
}