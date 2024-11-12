"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { chatViolations } from "@/data/chatDeletionReason";
import { useMutation, useQuery } from "convex/react";
import { FunctionReturnType } from "convex/server";
import {
  LoaderIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SendIcon,
  Trash,
  TrashIcon,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

import { useImageUpload } from "@/hooks/use-image-upload";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { MsgScrollArea } from "./msg-scroll-area";

export function Messages({ id }: { id: Id<"directMessages" | "channels"> }) {
  const messages = useQuery(api.functions.message.list, { dmOrChannelId: id });
  return (
    <>
      <MsgScrollArea
        className="h-full py-4"
        scrollToBottom={messages && messages.length > 0}
      >
        {messages?.map((message) => (
          <MessageItem key={message._id} message={message} />
        ))}
      </MsgScrollArea>
      <TypingIndicator id={id} />
      <MessageInput id={id} />
    </>
  );
}
function TypingIndicator({ id }: { id: Id<"directMessages" | "channels"> }) {
  const usernames = useQuery(api.functions.typing.list, { dmOrChannelId: id });
  if (!usernames || usernames.length === 0) return null;
  return (
    <div className="text-sm text-muted-foreground px-4 py-2">
      {usernames.join(", ")} is typing...
    </div>
  );
}

type Message = FunctionReturnType<typeof api.functions.message.list>[number];

function MessageItem({ message }: { message: Message }) {
  return (
    <div className="flex items-center px-4 gap-2 py-2">
      <Avatar className="size-8 border">
        {message.sender && <AvatarImage src={message.sender?.image} />}
        <AvatarFallback />
      </Avatar>
      <div className="flex flex-col mr-auto">
        <p className="text-xs text-muted-foreground">
          {message.sender?.username ?? "Deleted User"}
        </p>
        {message.deleted ? (
          <>
            <p className={`text-sm text-destructive`}>
              This message has been deleted.{" "}
              {message.deletedReason && (
                <span
                  className={
                    message.deletedReason == "D1" ? "text-muted-foreground" : ""
                  }
                >
                  Reason: {chatViolations[message.deletedReason] || ""}
                </span>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm">{message.content}</p>
          </>
        )}
        <div className="w-[%50]">
          {message.attachments?.map((attachment, index) => (
            <ImageFocus key={index}>
              <Image
                src={attachment ?? ""}
                width={300}
                height={300}
                className="rounded border overflow-hidden hover:shadow-lg transition-all"
                alt="Attachment"
              />
            </ImageFocus>
          ))}
        </div>
      </div>
      <MessageActions message={message} />
    </div>
  );
}

function ImageFocus({ children }: { children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger>{children}</DialogTrigger>
      <DialogContent>
        <DialogTitle />
        {children}
      </DialogContent>
    </Dialog>
  );
}

function MessageActions({ message }: { message: Message }) {
  const user = useQuery(api.functions.user.get);
  const removeMessage = useMutation(api.functions.message.remove);
  if (!user || message.sender?._id !== user._id) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <MoreHorizontalIcon className="size-4 text-muted-foreground" />
        <span className="sr-only">Message Actions</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => {
            removeMessage({ id: message._id });
          }}
        >
          <TrashIcon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MessageInput({ id }: { id: Id<"directMessages" | "channels"> }) {
  const [content, setContent] = useState("");
  const sendMessage = useMutation(api.functions.message.create);
  const sendTypingIndicator = useMutation(api.functions.typing.upsert);
  const imageUpload = useImageUpload({ singleFile: false });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (content.length === 0) {
      return;
    }
    try {
      await sendMessage({
        dmOrChannelId: id,
        content,
        attachments: imageUpload.storageIds,
      });
      setContent("");
      imageUpload.reset();
    } catch (error) {
      toast.error("Failed to send message", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
  return (
    <>
      <form onSubmit={handleSubmit} className="flex items-end p-4 gap-2">
        <Button type="button" size="icon" onClick={() => imageUpload.open()}>
          <PlusIcon />
          <span className="sr-only">Attach</span>
        </Button>
        <div className="flex flex-col flex-1 gap-2">
          {imageUpload.previewUrls && (
            <ImagePreview
              files={imageUpload.files}
              urls={imageUpload.previewUrls}
              isUploading={imageUpload.isUploading}
              onRemove={imageUpload.removeByIndex}
            />
          )}
          <Input
            placeholder="Message"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (e.target.value.length > 0) {
                sendTypingIndicator({ dmOrChannelId: id });
              }
            }}
          />
        </div>
        <Button size="icon">
          <SendIcon />
          <span className="sr-only">Send</span>
        </Button>
      </form>
      <input {...imageUpload.inputProps} />
    </>
  );
}

function ImagePreview({
  files,
  urls,
  isUploading,
  onRemove,
}: {
  files: File[];
  urls: string[];
  isUploading: boolean;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="relative size-41 flex gap-5">
      {urls?.map((url, index) => (
        <div className="h-full max-w-fit" key={index}>
          <div className="relative flex justify-end -right-4 top-5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="border bg-red-100 hover:bg-red-200"
              onClick={() => {
                onRemove(index);
              }}
            >
              <Trash className="dark:text-black" />
              <span className="sr-only">Remove</span>
            </Button>
          </div>
          <Card className="p-2.5">
            {url && (
              <Image
                src={url}
                alt="Attachment"
                width={300}
                height={300}
                className="rounded border overflow-hidden"
              />
            )}

            <p className="text-sm text-muted-foreground">{files[index].name}</p>
            <p className="text-sm text-muted-foreground">
              {files[index].size < 1024 * 1024
                ? `${(files[index].size / 1024).toFixed(2)} KB`
                : `${(files[index].size / (1024 * 1024)).toFixed(2)} MB`}
            </p>
          </Card>
        </div>
      ))}

      {isUploading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
          <LoaderIcon className="size-8 animate-spin" />
        </div>
      )}
    </div>
  );
}
