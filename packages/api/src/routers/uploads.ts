import { api, depsOf } from "../procedures";
import {
	completeUpload,
	getDownloadUrl,
	requestUpload,
} from "../services/uploads";

export const uploads = {
	requestUpload: api.uploads.requestUpload.handler(({ context, input }) =>
		requestUpload(depsOf(context), input),
	),
	completeUpload: api.uploads.completeUpload.handler(({ context, input }) =>
		completeUpload(depsOf(context), input.fileKey),
	),
};

export const files = {
	getDownloadUrl: api.files.getDownloadUrl.handler(({ context, input }) =>
		getDownloadUrl(depsOf(context), input.fileKey),
	),
};
