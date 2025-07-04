import { Notification, type NotificationConstructorOptions } from "electron";

export function createNotification({
  click,
  action,
  ...options
}: NotificationConstructorOptions & {
  click?: () => void;
  action?: (index: number) => void;
}) {
  if (!Notification.isSupported()) {
    return;
  }

  const notification = new Notification({
    silent: true,
    ...options,
  });

  if (click) {
    notification.once("click", click);
  }

  if (action) {
    notification.once("action", (_event, index) => {
      action?.(index);
    });
  }

  notification.show();

  return notification;
}
