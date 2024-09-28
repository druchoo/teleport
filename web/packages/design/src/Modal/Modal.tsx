/*
 * Teleport
 * Copyright (C) 2023  Gravitational, Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import React, { createRef, cloneElement } from 'react';
import styled, { StyleFunction } from 'styled-components';
import { createPortal } from 'react-dom';

type Props = {
  /**
   * If `true`, the modal is open.
   */
  open: boolean;

  className?: string;

  /**
   * Styles passed to the modal, the parent of the children.
   */
  // TODO(ravicious): The type for modalCss might need some work after we migrate the components
  // that use <Modal> to TypeScript.
  modalCss?: StyleFunction<any>;

  /**
   * The child must be a single HTML element. Modal used to call methods such as focus and
   * setAttribute on the outermost element. This is no longer the case, so technically this type can
   * be adjusted if needed.
   */
  children?: React.ReactElement;

  /**
   * Properties applied to the Backdrop element.
   */
  BackdropProps?: BackdropProps;

  /**
   * If `true`, clicking the backdrop will not fire any callback.
   */
  disableBackdropClick?: boolean;

  /**
   * If `true`, hitting escape will not fire any callback.
   */
  disableEscapeKeyDown?: boolean;

  /**
   * If `true`, the modal will not restore focus to previously focused element once
   * modal is hidden.
   */
  disableRestoreFocus?: boolean;

  /**
   * If `true`, the backdrop is not rendered.
   */
  hideBackdrop?: boolean;

  /**
   * Callback fired when the backdrop is clicked.
   */
  onBackdropClick?: (event: React.MouseEvent) => void;

  /**
   * Callback fired when the component requests to be closed.
   * The `reason` parameter can optionally be used to control the response to `onClose`.
   */
  onClose?: (
    event: KeyboardEvent | React.MouseEvent,
    reason: 'escapeKeyDown' | 'backdropClick'
  ) => void;

  /**
   * Callback fired when the escape key is pressed,
   * `disableEscapeKeyDown` is false and the modal is in focus.
   */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
};

export default class Modal extends React.Component<Props> {
  lastFocus: HTMLElement | undefined;
  modalRef = createRef<HTMLElement>();
  mounted = false;

  componentDidMount() {
    this.mounted = true;
    if (this.props.open) {
      this.handleOpen();
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.open && !this.props.open) {
      this.handleClose();
    } else if (!prevProps.open && this.props.open) {
      this.lastFocus = document.activeElement as HTMLElement;
      this.handleOpen();
    }
  }

  componentWillUnmount() {
    this.mounted = false;
    if (this.props.open) {
      this.handleClose();
    }
  }

  dialogEl = (): Element => {
    const modalEl = this.modalRef.current;
    if (!modalEl) {
      return;
    }

    const isBackdropRenderedFirst = !this.props.hideBackdrop;

    if (isBackdropRenderedFirst) {
      return modalEl.children[1];
    }

    return modalEl.firstElementChild;
  };

  handleOpen = () => {
    document.addEventListener('keydown', this.handleDocumentKeyDown);

    if (this.dialogEl()) {
      this.handleOpened();
    }
  };

  handleOpened = () => {
    // Fix a bug on Chrome where the scroll isn't initially 0.
    this.modalRef.current.scrollTop = 0;
  };

  handleClose = () => {
    document.removeEventListener('keydown', this.handleDocumentKeyDown);

    this.restoreLastFocus();
  };

  handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (this.props.onBackdropClick) {
      this.props.onBackdropClick(event);
    }

    if (!this.props.disableBackdropClick && this.props.onClose) {
      this.props.onClose(event, 'backdropClick');
    }
  };

  handleDocumentKeyDown = (event: KeyboardEvent) => {
    const ESC = 'Escape';

    // Ignore events that have been `event.preventDefault()` marked.
    if (event.key !== ESC || event.defaultPrevented) {
      return;
    }

    if (this.props.onEscapeKeyDown) {
      this.props.onEscapeKeyDown(event);
    }

    if (!this.props.disableEscapeKeyDown && this.props.onClose) {
      this.props.onClose(event, 'escapeKeyDown');
    }
  };

  restoreLastFocus() {
    if (this.props.disableRestoreFocus || !this.lastFocus) {
      return;
    }

    // Not all elements in IE 11 have a focus method.
    // Because IE 11 market share is low, we accept the restore focus being broken
    // and we silent the issue.
    if (this.lastFocus.focus) {
      this.lastFocus.focus();
    }

    this.lastFocus = null;
  }

  render() {
    const { BackdropProps, children, modalCss, hideBackdrop, open, className } =
      this.props;

    if (!open) {
      return null;
    }

    return createPortal(
      <StyledModal
        modalCss={modalCss}
        data-testid="Modal"
        ref={this.modalRef}
        className={className}
        onClick={e => e.stopPropagation()}
      >
        {!hideBackdrop && (
          <Backdrop onClick={this.handleBackdropClick} {...BackdropProps} />
        )}
        {cloneElement(children, {})}
      </StyledModal>,
      document.body
    );
  }
}

type BackdropProps = {
  /**
   * Allows backdrop to keep bg color of parent eg: popup menu
   */
  invisible: boolean;
  [prop: string]: any;
};

function Backdrop(props: BackdropProps) {
  const { invisible, ...rest } = props;
  return (
    <StyledBackdrop
      data-testid="backdrop"
      aria-hidden="true"
      invisible={invisible}
      {...rest}
    />
  );
}

const StyledBackdrop = styled.div<BackdropProps>`
  z-index: -1;
  position: fixed;
  right: 0;
  bottom: 0;
  top: 0;
  left: 0;
  background-color: ${props =>
    props.invisible ? 'transparent' : `rgba(0, 0, 0, 0.5)`};
  opacity: 1;
  touch-action: none;
`;

const StyledModal = styled.div<{
  modalCss: StyleFunction<any>;
  ref: React.ForwardedRef<HTMLElement>;
}>`
  position: fixed;
  z-index: 1200;
  right: 0;
  bottom: 0;
  top: 0;
  left: 0;
  ${props => props.modalCss?.(props)}
`;