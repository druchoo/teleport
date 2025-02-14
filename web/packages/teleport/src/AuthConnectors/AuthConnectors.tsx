/**
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

import { Alert, Box, Flex, H3, Indicator, Link } from 'design';
import { H2, P } from 'design/Text/Text';

import {
  DesktopDescription,
  MobileDescription,
  ResponsiveAddButton,
  ResponsiveFeatureHeader,
} from 'teleport/AuthConnectors/styles/AuthConnectors.styles';
import { FeatureBox, FeatureHeaderTitle } from 'teleport/components/Layout';
import ResourceEditor from 'teleport/components/ResourceEditor';
import useResources from 'teleport/components/useResources';

import ConnectorList from './ConnectorList';
import CTAConnectors from './ConnectorList/CTAConnectors';
import DeleteConnectorDialog from './DeleteConnectorDialog';
import EmptyList from './EmptyList';
import templates from './templates';
import useAuthConnectors, { State } from './useAuthConnectors';

export function AuthConnectorsContainer() {
  const state = useAuthConnectors();
  return <AuthConnectors {...state} />;
}

export function AuthConnectors(props: State) {
  const { attempt, items, remove, save } = props;
  const isEmpty = items.length === 0;
  const resources = useResources(items, templates);

  const title =
    resources.status === 'creating'
      ? 'Creating a new github connector'
      : 'Editing github connector';
  const description =
    'Auth connectors allow Teleport to authenticate users via an external identity source such as Okta, Microsoft Entra ID, GitHub, etc. This authentication method is commonly known as single sign-on (SSO).';

  function handleOnSave(content: string) {
    const name = resources.item.name;
    const isNew = resources.status === 'creating';
    return save(name, content, isNew);
  }

  return (
    <FeatureBox>
      <ResponsiveFeatureHeader>
        <FeatureHeaderTitle>Auth Connectors</FeatureHeaderTitle>
        <MobileDescription>{description}</MobileDescription>
        <ResponsiveAddButton
          fill="border"
          onClick={() => resources.create('github')}
        >
          New GitHub Connector
        </ResponsiveAddButton>
      </ResponsiveFeatureHeader>
      {attempt.status === 'failed' && <Alert children={attempt.statusText} />}
      {attempt.status === 'processing' && (
        <Box textAlign="center" m={10}>
          <Indicator />
        </Box>
      )}
      {attempt.status === 'success' && (
        <Flex alignItems="start">
          <Flex flexDirection="column" width="100%" gap={5}>
            <Box>
              <H2 mb={4}>Your Connectors</H2>
              {isEmpty ? (
                <EmptyList onCreate={() => resources.create('github')} />
              ) : (
                <ConnectorList
                  items={items}
                  onEdit={resources.edit}
                  onDelete={resources.remove}
                />
              )}
            </Box>
            <CTAConnectors />
          </Flex>
          <DesktopDescription>
            <H3 mb={3}>Auth Connectors</H3>
            <P mb={3}>{description}</P>
            <P mb={2}>
              Please{' '}
              <Link
                color="text.main"
                // This URL is the OSS documentation for auth connectors
                href="https://goteleport.com/docs/setup/admin/github-sso/"
                target="_blank"
              >
                view our documentation
              </Link>{' '}
              on how to configure a GitHub connector.
            </P>
          </DesktopDescription>
        </Flex>
      )}
      {(resources.status === 'creating' || resources.status === 'editing') && (
        <ResourceEditor
          title={title}
          onSave={handleOnSave}
          text={resources.item.content}
          name={resources.item.name}
          isNew={resources.status === 'creating'}
          onClose={resources.disregard}
        />
      )}
      {resources.status === 'removing' && (
        <DeleteConnectorDialog
          name={resources.item.name}
          onClose={resources.disregard}
          onDelete={() => remove(resources.item.name)}
        />
      )}
    </FeatureBox>
  );
}
