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

package db

import (
	"context"
	"log/slog"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/redshiftserverless"
	"github.com/aws/aws-sdk-go/service/redshiftserverless/redshiftserverlessiface"
	"github.com/gravitational/trace"

	"github.com/gravitational/teleport/api/types"
	"github.com/gravitational/teleport/lib/cloud"
	libcloudaws "github.com/gravitational/teleport/lib/cloud/aws"
	"github.com/gravitational/teleport/lib/srv/discovery/common"
)

// newRedshiftServerlessFetcher returns a new AWS fetcher for Redshift
// Serverless databases.
func newRedshiftServerlessFetcher(cfg awsFetcherConfig) (common.Fetcher, error) {
	return newAWSFetcher(cfg, &redshiftServerlessPlugin{})
}

type workgroupWithTags struct {
	*redshiftserverless.Workgroup

	Tags []*redshiftserverless.Tag
}

// redshiftServerlessPlugin retrieves Redshift Serverless databases.
type redshiftServerlessPlugin struct{}

func (f *redshiftServerlessPlugin) ComponentShortName() string {
	// (r)ed(s)hift (s)erver(<)less
	return "rss<"
}

// rssAPI is a type alias for brevity alone.
type rssAPI = redshiftserverlessiface.RedshiftServerlessAPI

// GetDatabases returns Redshift Serverless databases matching the watcher's selectors.
func (f *redshiftServerlessPlugin) GetDatabases(ctx context.Context, cfg *awsFetcherConfig) (types.Databases, error) {
	client, err := cfg.AWSClients.GetAWSRedshiftServerlessClient(ctx, cfg.Region,
		cloud.WithAssumeRole(cfg.AssumeRole.RoleARN, cfg.AssumeRole.ExternalID),
		cloud.WithCredentialsMaybeIntegration(cfg.Integration),
	)
	if err != nil {
		return nil, trace.Wrap(err)
	}
	databases, workgroups, err := getDatabasesFromWorkgroups(ctx, client, cfg.Logger)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	if len(workgroups) > 0 {
		vpcEndpointDatabases, err := getDatabasesFromVPCEndpoints(ctx, workgroups, client, cfg.Logger)
		if err != nil {
			if trace.IsAccessDenied(err) {
				cfg.Logger.DebugContext(ctx, "No permission to get Redshift Serverless VPC endpoints", "error", err)
			} else {
				cfg.Logger.WarnContext(ctx, "Failed to get Redshift Serverless VPC endpoints", "error", err)
			}
		}

		databases = append(databases, vpcEndpointDatabases...)
	}
	return databases, nil
}

func getDatabasesFromWorkgroups(ctx context.Context, client rssAPI, logger *slog.Logger) (types.Databases, []*workgroupWithTags, error) {
	workgroups, err := getRSSWorkgroups(ctx, client)
	if err != nil {
		return nil, nil, trace.Wrap(err)
	}

	var databases types.Databases
	var workgroupsWithTags []*workgroupWithTags
	for _, workgroup := range workgroups {
		if !libcloudaws.IsResourceAvailable(workgroup, workgroup.Status) {
			logger.DebugContext(ctx, "Skipping unavailable  Redshift Serverless workgroup",
				"workgroup", aws.StringValue(workgroup.WorkgroupName),
				"status", aws.StringValue(workgroup.Status),
			)
			continue
		}

		tags := getRSSResourceTags(ctx, workgroup.WorkgroupArn, client, logger)
		database, err := common.NewDatabaseFromRedshiftServerlessWorkgroup(workgroup, tags)
		if err != nil {
			logger.InfoContext(ctx, "Could not convert Redshift Serverless workgroup to database resource",
				"workgroup", aws.StringValue(workgroup.WorkgroupName),
				"error", err,
			)
			continue
		}

		databases = append(databases, database)
		workgroupsWithTags = append(workgroupsWithTags, &workgroupWithTags{
			Workgroup: workgroup,
			Tags:      tags,
		})
	}
	return databases, workgroupsWithTags, nil
}

func getDatabasesFromVPCEndpoints(ctx context.Context, workgroups []*workgroupWithTags, client rssAPI, logger *slog.Logger) (types.Databases, error) {
	endpoints, err := getRSSVPCEndpoints(ctx, client)
	if err != nil {
		return nil, trace.Wrap(err)
	}

	var databases types.Databases
	for _, endpoint := range endpoints {
		workgroup, found := findWorkgroupWithName(workgroups, aws.StringValue(endpoint.WorkgroupName))
		if !found {
			logger.DebugContext(ctx, "Could not find matching workgroup for Redshift Serverless endpoint", "endpoint", aws.StringValue(endpoint.EndpointName))
			continue
		}

		if !libcloudaws.IsResourceAvailable(endpoint, endpoint.EndpointStatus) {
			logger.DebugContext(ctx, "Skipping unavailable Redshift Serverless endpoint",
				"endpoint", aws.StringValue(endpoint.EndpointName),
				"status", aws.StringValue(endpoint.EndpointStatus),
			)
			continue
		}

		// VPC endpoints do not have resource tags attached to them. Use the
		// tags from the workgroups instead.
		database, err := common.NewDatabaseFromRedshiftServerlessVPCEndpoint(endpoint, workgroup.Workgroup, workgroup.Tags)
		if err != nil {
			logger.InfoContext(ctx, "Could not convert Redshift Serverless endpoint to database resource",
				"endpoint", aws.StringValue(endpoint.EndpointName),
				"error", err,
			)
			continue
		}
		databases = append(databases, database)
	}
	return databases, nil
}

func getRSSResourceTags(ctx context.Context, arn *string, client rssAPI, logger *slog.Logger) []*redshiftserverless.Tag {
	output, err := client.ListTagsForResourceWithContext(ctx, &redshiftserverless.ListTagsForResourceInput{
		ResourceArn: arn,
	})
	if err != nil {
		// Log errors here and return nil.
		if trace.IsAccessDenied(err) {
			logger.DebugContext(ctx, "No Permission to get Redshift Serverless tags",
				"arn", aws.StringValue(arn),
				"error", err,
			)
		} else {
			logger.WarnContext(ctx, "Failed to get Redshift Serverless tags",
				"arn", aws.StringValue(arn),
				"error", err,
			)
		}
		return nil
	}
	return output.Tags
}

func getRSSWorkgroups(ctx context.Context, client rssAPI) ([]*redshiftserverless.Workgroup, error) {
	var pages [][]*redshiftserverless.Workgroup
	err := client.ListWorkgroupsPagesWithContext(ctx, nil, func(page *redshiftserverless.ListWorkgroupsOutput, lastPage bool) bool {
		pages = append(pages, page.Workgroups)
		return len(pages) <= maxAWSPages
	})
	return flatten(pages), libcloudaws.ConvertRequestFailureError(err)
}

func getRSSVPCEndpoints(ctx context.Context, client rssAPI) ([]*redshiftserverless.EndpointAccess, error) {
	var pages [][]*redshiftserverless.EndpointAccess
	err := client.ListEndpointAccessPagesWithContext(ctx, nil, func(page *redshiftserverless.ListEndpointAccessOutput, lastPage bool) bool {
		pages = append(pages, page.Endpoints)
		return len(pages) <= maxAWSPages
	})
	return flatten(pages), libcloudaws.ConvertRequestFailureError(err)
}

func findWorkgroupWithName(workgroups []*workgroupWithTags, name string) (*workgroupWithTags, bool) {
	for _, workgroup := range workgroups {
		if aws.StringValue(workgroup.WorkgroupName) == name {
			return workgroup, true
		}
	}
	return nil, false
}
